import { query } from "./_generated/server";
import { v } from "convex/values";

export const current = query({
  args: {},
  returns: v.union(v.null(), v.object({ name: v.union(v.string(), v.null()) })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    return { name: identity.name ?? null };
  },
});
