import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export function reminderKey(loanId: string, date: string) {
  return `reminder:${loanId}:${date}`;
}

const vOverdueLoan = v.object({
  loanId: v.id("loans"),
  reminderKey: v.string(),
  borrower: v.object({ name: v.string(), email: v.string() }),
  lenderName: v.string(),
  toolName: v.string(),
  endDate: v.string(),
  daysOverdue: v.number(),
});

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export const listOverdue = internalQuery({
  args: { date: v.string() },
  returns: v.array(vOverdueLoan),
  handler: async (ctx, args) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_and_endDate", (q) => q.eq("status", "approved").lt("endDate", args.date))
      .take(100);

    const result = [];
    for (const loan of loans) {
      const key = reminderKey(loan._id, args.date);
      const already = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", key))
        .unique();
      if (already?.outcome === "sent") continue;

      const borrower = await ctx.db.get("users", loan.borrowerId);
      const lender = await ctx.db.get("users", loan.ownerId);
      const tool = await ctx.db.get("tools", loan.toolId);
      if (!borrower?.email || !lender || !tool) continue;

      result.push({
        loanId: loan._id,
        reminderKey: key,
        borrower: { name: borrower.name, email: borrower.email },
        lenderName: lender.name,
        toolName: tool.name,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, args.date),
      });
    }
    return result;
  },
});

export const recordReminder = internalMutation({
  args: {
    loanId: v.string(),
    date: v.string(),
    outcome: v.union(v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
  },
  returns: v.union(v.object({ ok: v.literal(true), created: v.boolean() }), v.object({ ok: v.literal(false), error: v.string() })),
  handler: async (ctx, args) => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    if (loanId === null) return { ok: false as const, error: "unknown loan" };
    const loan = await ctx.db.get("loans", loanId);
    if (loan === null) return { ok: false as const, error: "unknown loan" };

    const idempotencyKey = reminderKey(loanId, args.date);
    const detail = args.detail?.slice(0, 200);
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();

    if (existing === null) {
      await ctx.db.insert("automationEvents", {
        loanId,
        kind: "overdue_reminder",
        idempotencyKey,
        outcome: args.outcome,
        detail,
      });
      return { ok: true as const, created: true };
    }
    if (existing.outcome === "failed" && args.outcome === "sent") {
      await ctx.db.patch("automationEvents", existing._id, { outcome: "sent", detail });
    }
    return { ok: true as const, created: false };
  },
});
