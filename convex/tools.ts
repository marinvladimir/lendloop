import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireToolOwner, requireToolOwnerOrAdmin, requireUser } from "./access";
import { vCategory, vCondition } from "./model";
import { cleanText, isIsoDate, LIMITS } from "./rules";
import { queueLoanEvent } from "./notifications";

export const listPublic = query({
  args: {},
  returns: v.array(v.object({ name: v.string(), category: vCategory })),
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_removedAt_and_category", (q) => q.eq("removedAt", undefined))
      .take(200);
    return tools.map((tool) => ({ name: tool.name, category: tool.category }));
  },
});

const vAvailability = v.union(
  v.object({ state: v.literal("available"), nextBookedFrom: v.union(v.string(), v.null()) }),
  v.object({ state: v.literal("on_loan"), until: v.string() }),
);

const vBoardTool = v.object({
  _id: v.id("tools"),
  name: v.string(),
  category: vCategory,
  condition: vCondition,
  description: v.string(),
  ownerName: v.string(),
  ownerTrusted: v.boolean(),
  isMine: v.boolean(),
  availability: vAvailability,
});

async function availabilityOf(ctx: QueryCtx, tool: Doc<"tools">, today: string) {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", tool._id).eq("status", "approved"))
    .take(50);
  const current = approved.find((loan) => loan.startDate <= today);
  if (current) return { state: "on_loan" as const, until: current.endDate };
  const upcoming = approved.map((loan) => loan.startDate).sort()[0] ?? null;
  return { state: "available" as const, nextBookedFrom: upcoming };
}

export const listBoard = query({
  args: { category: v.optional(vCategory), today: v.string() },
  returns: v.array(vBoardTool),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const today = isIsoDate(args.today) ? args.today : "9999-12-31";
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_removedAt_and_category", (q) =>
        args.category === undefined
          ? q.eq("removedAt", undefined)
          : q.eq("removedAt", undefined).eq("category", args.category),
      )
      .take(200);

    const owners = new Map<string, Doc<"users"> | null>();
    const result = [];
    for (const tool of tools) {
      if (!owners.has(tool.ownerId)) owners.set(tool.ownerId, await ctx.db.get("users", tool.ownerId));
      const owner = owners.get(tool.ownerId) ?? null;
      result.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        ownerName: owner?.name ?? "Unknown",
        ownerTrusted: owner?.trustedLender ?? false,
        isMine: tool.ownerId === viewer._id,
        availability: await availabilityOf(ctx, tool, today),
      });
    }
    return result;
  },
});

export const listMine = query({
  args: { today: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("tools"),
      name: v.string(),
      category: vCategory,
      condition: vCondition,
      description: v.string(),
      availability: vAvailability,
      pendingRequests: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const today = isIsoDate(args.today) ? args.today : "9999-12-31";
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", viewer._id))
      .order("desc")
      .take(100);

    const result = [];
    for (const tool of tools) {
      if (tool.removedAt !== undefined) continue;
      const pending = await ctx.db
        .query("loans")
        .withIndex("by_toolId_and_status", (q) => q.eq("toolId", tool._id).eq("status", "requested"))
        .take(50);
      result.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        availability: await availabilityOf(ctx, tool, today),
        pendingRequests: pending.length,
      });
    }
    return result;
  },
});

const toolFields = {
  name: v.string(),
  category: vCategory,
  condition: vCondition,
  description: v.string(),
};

function cleanToolFields(args: { name: string; description: string }) {
  return {
    name: cleanText(args.name, "Name", LIMITS.toolName, true),
    description: cleanText(args.description, "Description", LIMITS.toolDescription, false),
  };
}

export const create = mutation({
  args: toolFields,
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      category: args.category,
      condition: args.condition,
      ...cleanToolFields(args),
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireToolOwner(ctx, args.toolId);
    await ctx.db.patch("tools", args.toolId, {
      category: args.category,
      condition: args.condition,
      ...cleanToolFields(args),
    });
    return null;
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireToolOwnerOrAdmin(ctx, args.toolId);
    const now = Date.now();
    await ctx.db.patch("tools", args.toolId, { removedAt: now });

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_toolId_and_status", (q) => q.eq("toolId", args.toolId).eq("status", "requested"))
      .take(100);
    for (const loan of pending) {
      await ctx.db.patch("loans", loan._id, { status: "cancelled", decidedAt: now });
      await queueLoanEvent(ctx, loan._id, "listing_removed");
    }
    return null;
  },
});
