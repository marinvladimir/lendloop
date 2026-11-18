import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Category, Condition } from "./model";

const DEMO_OWNER_TOKEN = "seed|demo-owner";

const DEMO_TOOLS: { name: string; category: Category; condition: Condition; description: string }[] = [
  { name: "Cordless drill", category: "power_tools", condition: "good", description: "18V with two batteries and a bit set." },
  { name: "Circular saw", category: "power_tools", condition: "fair", description: "Cuts straight, blade is a bit tired." },
  { name: "Socket set", category: "hand_tools", condition: "good", description: "Metric and imperial, 1/4 and 3/8 drive." },
  { name: "Hedge trimmer", category: "garden", condition: "good", description: "Electric, 50 cm blade." },
  { name: "Wheelbarrow", category: "garden", condition: "worn", description: "Works fine, tyre needs air now and then." },
  { name: "Stand mixer", category: "kitchen", condition: "new", description: "Used twice. Comes with dough hook and whisk." },
  { name: "Four-person tent", category: "camping", condition: "good", description: "Easy to pitch, includes footprint." },
  { name: "Carpet cleaner", category: "cleaning", condition: "fair", description: "Bring your own cleaning solution." },
];

export const overdueDemo = internalMutation({
  args: { borrowerEmail: v.string(), daysOverdue: v.optional(v.number()) },
  returns: v.id("loans"),
  handler: async (ctx, args) => {
    const borrower = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.borrowerEmail.toLowerCase()))
      .first();
    if (borrower === null) throw new Error("No user with that email. Sign in once first.");
    const owner = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", DEMO_OWNER_TOKEN))
      .unique();
    if (owner === null) throw new Error("Run seed:run first.");
    const tool = await ctx.db
      .query("tools")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", owner._id))
      .first();
    if (tool === null) throw new Error("Run seed:run first.");

    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const late = args.daysOverdue ?? 2;
    return await ctx.db.insert("loans", {
      toolId: tool._id,
      ownerId: owner._id,
      borrowerId: borrower._id,
      startDate: day(-late - 3),
      endDate: day(-late),
      status: "approved",
      decidedAt: Date.now(),
    });
  },
});

export const run = internalMutation({
  args: {},
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", DEMO_OWNER_TOKEN))
      .unique();
    if (existing !== null) return { inserted: 0 };

    const ownerId = await ctx.db.insert("users", {
      tokenIdentifier: DEMO_OWNER_TOKEN,
      name: "Demo Neighbor",
      role: "user",
      trustedLender: false,
    });
    for (const tool of DEMO_TOOLS) {
      await ctx.db.insert("tools", { ownerId, ...tool });
    }
    return { inserted: DEMO_TOOLS.length };
  },
});
