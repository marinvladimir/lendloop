import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { accessError, getViewer, requireAdmin } from "./access";
import { vRole } from "./model";

export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw accessError("UNAUTHENTICATED", "Please sign in first.");

    const name = identity.name?.trim() || identity.email?.split("@")[0] || "Neighbor";
    const email = identity.email?.toLowerCase();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing !== null) {
      if (existing.name !== name || existing.email !== email) {
        await ctx.db.patch("users", existing._id, { name, email });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: "user",
      trustedLender: false,
    });
  },
});

export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      name: v.string(),
      role: vRole,
      trustedLender: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (user === null) return null;
    return { _id: user._id, name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get("users", args.userId);
    if (target === null) throw accessError("NOT_FOUND", "That user does not exist.");
    await ctx.db.patch("users", args.userId, { trustedLender: args.trusted });
    return null;
  },
});

export const setRole = internalMutation({
  args: { email: v.string(), role: vRole },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .take(10);
    for (const user of users) {
      await ctx.db.patch("users", user._id, { role: args.role });
    }
    return { updated: users.length };
  },
});
