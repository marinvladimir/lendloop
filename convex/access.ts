import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export type AccessErrorCode = "UNAUTHENTICATED" | "NO_ACCOUNT" | "FORBIDDEN" | "NOT_FOUND";

export function accessError(code: AccessErrorCode, message: string) {
  return new ConvexError({ code, message });
}

export async function getViewer(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw accessError("UNAUTHENTICATED", "Please sign in first.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (user === null) throw accessError("NO_ACCOUNT", "Your account is still being set up. Try again in a moment.");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw accessError("FORBIDDEN", "Only admins can do that.");
  return user;
}

async function getActiveTool(ctx: Ctx, toolId: Id<"tools">): Promise<Doc<"tools">> {
  const tool = await ctx.db.get("tools", toolId);
  if (tool === null || tool.removedAt !== undefined) throw accessError("NOT_FOUND", "That tool is no longer listed.");
  return tool;
}

export async function requireToolOwner(ctx: Ctx, toolId: Id<"tools">) {
  const user = await requireUser(ctx);
  const tool = await getActiveTool(ctx, toolId);
  if (tool.ownerId !== user._id) throw accessError("FORBIDDEN", "You can only change your own listings.");
  return { user, tool };
}

export async function requireToolOwnerOrAdmin(ctx: Ctx, toolId: Id<"tools">) {
  const user = await requireUser(ctx);
  const tool = await getActiveTool(ctx, toolId);
  if (tool.ownerId !== user._id && user.role !== "admin") {
    throw accessError("FORBIDDEN", "You can only remove your own listings.");
  }
  return { user, tool };
}

async function getLoan(ctx: Ctx, loanId: Id<"loans">): Promise<Doc<"loans">> {
  const loan = await ctx.db.get("loans", loanId);
  if (loan === null) throw accessError("NOT_FOUND", "That request does not exist.");
  return loan;
}

export async function requireLoanLender(ctx: Ctx, loanId: Id<"loans">) {
  const user = await requireUser(ctx);
  const loan = await getLoan(ctx, loanId);
  if (loan.ownerId !== user._id) throw accessError("FORBIDDEN", "Only the owner of the tool can do that.");
  return { user, loan };
}

export async function requireLoanBorrower(ctx: Ctx, loanId: Id<"loans">) {
  const user = await requireUser(ctx);
  const loan = await getLoan(ctx, loanId);
  if (loan.borrowerId !== user._id) throw accessError("FORBIDDEN", "Only the borrower can do that.");
  return { user, loan };
}

export async function requireLoanParticipantOrAdmin(ctx: Ctx, loanId: Id<"loans">) {
  const user = await requireUser(ctx);
  const loan = await getLoan(ctx, loanId);
  const involved = loan.ownerId === user._id || loan.borrowerId === user._id;
  if (!involved && user.role !== "admin") throw accessError("FORBIDDEN", "You are not part of this loan.");
  return { user, loan };
}
