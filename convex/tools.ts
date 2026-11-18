import { query } from "./_generated/server";
import { v } from "convex/values";
import { vCategory } from "./model";

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
