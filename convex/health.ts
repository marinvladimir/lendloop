import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./access";

const LIMITS = { workflow: 120, node: 120, message: 500, externalId: 120 };

export const recordIntegrationFailure = internalMutation({
  args: {
    externalId: v.string(),
    workflow: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
  },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    const externalId = args.externalId.slice(0, LIMITS.externalId);
    const existing = await ctx.db
      .query("integrationFailures")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .unique();
    if (existing !== null) return { created: false };

    await ctx.db.insert("integrationFailures", {
      source: "n8n",
      externalId,
      workflow: args.workflow.slice(0, LIMITS.workflow),
      node: args.node?.slice(0, LIMITS.node),
      message: args.message.slice(0, LIMITS.message),
    });
    return { created: true };
  },
});

export const recentProblems = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      at: v.number(),
      source: v.union(v.literal("convex"), v.literal("n8n")),
      title: v.string(),
      message: v.string(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const failedEvents = await ctx.db
      .query("automationEvents")
      .withIndex("by_outcome", (q) => q.eq("outcome", "failed"))
      .order("desc")
      .take(20);
    const n8nFailures = await ctx.db.query("integrationFailures").order("desc").take(20);

    const problems = [];
    for (const event of failedEvents) {
      const loan = await ctx.db.get("loans", event.loanId);
      const tool = loan ? await ctx.db.get("tools", loan.toolId) : null;
      problems.push({
        id: event._id,
        at: event._creationTime,
        source: "convex" as const,
        title: `${event.kind === "overdue_reminder" ? "Overdue reminder" : "Loan notification"} for ${tool?.name ?? "a deleted tool"}`,
        message: event.detail ?? "No details",
      });
    }
    for (const failure of n8nFailures) {
      problems.push({
        id: failure._id,
        at: failure._creationTime,
        source: "n8n" as const,
        title: failure.node ? `${failure.workflow}: ${failure.node}` : failure.workflow,
        message: failure.message,
      });
    }
    return problems.sort((a, b) => b.at - a.at).slice(0, 20);
  },
});
