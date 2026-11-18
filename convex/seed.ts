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
