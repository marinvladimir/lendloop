import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  accessError,
  requireAdmin,
  requireLoanBorrower,
  requireLoanLender,
  requireUser,
} from "./access";
import { vLoanStatus } from "./model";
import { addDays, blockedUntil, isIsoDate, rangesOverlap, todayUtc, validateDateRange } from "./rules";
import { queueLoanEvent } from "./notifications";

async function approvedLoansFor(ctx: QueryCtx, toolId: Id<"tools">) {
  return await ctx.db
    .query("loans")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .take(100);
}

function clashesWithApproved(approved: Doc<"loans">[], range: { startDate: string; endDate: string }) {
  const today = todayUtc();
  return approved.some((loan) => rangesOverlap({ startDate: loan.startDate, endDate: blockedUntil(loan, today) }, range));
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  returns: v.id("loans"),
  handler: async (ctx, args) => {
    const borrower = await requireUser(ctx);
    const tool = await ctx.db.get("tools", args.toolId);
    if (tool === null || tool.removedAt !== undefined) throw accessError("NOT_FOUND", "That tool is no longer listed.");
    if (tool.ownerId === borrower._id) throw accessError("FORBIDDEN", "You cannot borrow your own tool.");
    validateDateRange(args.startDate, args.endDate);

    const range = { startDate: args.startDate, endDate: args.endDate };
    const approved = await approvedLoansFor(ctx, tool._id);
    if (clashesWithApproved(approved, range)) {
      throw accessError("CONFLICT", "The tool is already lent out for some of those days.");
    }

    const open = await ctx.db
      .query("loans")
      .withIndex("by_toolId_and_status", (q) => q.eq("toolId", tool._id).eq("status", "requested"))
      .take(100);
    if (open.some((loan) => loan.borrowerId === borrower._id)) {
      throw accessError("CONFLICT", "You already have an open request for this tool.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: borrower._id,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "requested",
    });
    await queueLoanEvent(ctx, loanId, "requested");
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { loan } = await requireLoanLender(ctx, args.loanId);
    if (loan.status !== "requested") throw accessError("CONFLICT", "Only open requests can be approved.");
    const tool = await ctx.db.get("tools", loan.toolId);
    if (tool === null || tool.removedAt !== undefined) throw accessError("NOT_FOUND", "That tool is no longer listed.");

    if (loan.endDate < addDays(todayUtc(), -1)) {
      throw accessError("CONFLICT", "The dates of this request have already passed. Decline it instead.");
    }
    const approved = await approvedLoansFor(ctx, loan.toolId);
    if (clashesWithApproved(approved, loan)) {
      throw accessError("CONFLICT", "The tool is already lent out for some of those days.");
    }
    await ctx.db.patch("loans", loan._id, { status: "approved", decidedAt: Date.now() });
    await queueLoanEvent(ctx, loan._id, "approved");
    return null;
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { loan } = await requireLoanLender(ctx, args.loanId);
    if (loan.status !== "requested") throw accessError("CONFLICT", "Only open requests can be declined.");
    await ctx.db.patch("loans", loan._id, { status: "declined", decidedAt: Date.now() });
    await queueLoanEvent(ctx, loan._id, "declined");
    return null;
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { loan } = await requireLoanBorrower(ctx, args.loanId);
    const notStarted = loan.status === "approved" && loan.startDate > todayUtc();
    if (loan.status !== "requested" && !notStarted) {
      throw accessError("CONFLICT", "Only open requests and loans that have not started can be cancelled.");
    }
    await ctx.db.patch("loans", loan._id, { status: "cancelled", decidedAt: Date.now() });
    await queueLoanEvent(ctx, loan._id, "cancelled_by_borrower");
    return null;
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { loan } = await requireLoanLender(ctx, args.loanId);
    if (loan.status !== "approved") throw accessError("CONFLICT", "Only approved loans can be marked as returned.");
    await ctx.db.patch("loans", loan._id, { status: "returned", returnedAt: Date.now() });
    await queueLoanEvent(ctx, loan._id, "returned");
    return null;
  },
});

const vLoanRow = v.object({
  _id: v.id("loans"),
  _creationTime: v.number(),
  toolName: v.string(),
  toolRemoved: v.boolean(),
  ownerName: v.string(),
  borrowerName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  status: vLoanStatus,
  overdue: v.boolean(),
  expired: v.boolean(),
  cancellable: v.boolean(),
  activity: v.array(
    v.object({
      label: v.string(),
      outcome: v.union(v.literal("sent"), v.literal("failed")),
      at: v.number(),
    }),
  ),
});

const notifiedParty: Record<string, "Lender" | "Borrower"> = {
  requested: "Lender",
  cancelled_by_borrower: "Lender",
  approved: "Borrower",
  declined: "Borrower",
  listing_removed: "Borrower",
  returned: "Borrower",
};

function activityLabel(event: Doc<"automationEvents">) {
  if (event.kind === "overdue_reminder") {
    return event.outcome === "sent" ? "Overdue reminder sent" : "Overdue reminder failed";
  }
  const party = notifiedParty[event.idempotencyKey.split(":")[2] ?? ""] ?? "Participant";
  return event.outcome === "sent" ? `${party} notified` : `${party} notification failed`;
}

async function recentActivity(ctx: QueryCtx, loanId: Id<"loans">) {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loanId", (q) => q.eq("loanId", loanId))
    .order("desc")
    .take(3);
  return events.map((event) => ({ label: activityLabel(event), outcome: event.outcome, at: event._creationTime }));
}

async function toRows(ctx: QueryCtx, loans: Doc<"loans">[], today: string) {
  const users = new Map<Id<"users">, Doc<"users"> | null>();
  const tools = new Map<Id<"tools">, Doc<"tools"> | null>();
  const userName = async (id: Id<"users">) => {
    if (!users.has(id)) users.set(id, await ctx.db.get("users", id));
    return users.get(id)?.name ?? "Unknown";
  };

  const rows = [];
  for (const loan of loans) {
    if (!tools.has(loan.toolId)) tools.set(loan.toolId, await ctx.db.get("tools", loan.toolId));
    const tool = tools.get(loan.toolId) ?? null;
    rows.push({
      _id: loan._id,
      _creationTime: loan._creationTime,
      toolName: tool?.name ?? "Deleted tool",
      toolRemoved: tool === null || tool.removedAt !== undefined,
      ownerName: await userName(loan.ownerId),
      borrowerName: await userName(loan.borrowerId),
      startDate: loan.startDate,
      endDate: loan.endDate,
      status: loan.status,
      overdue: loan.status === "approved" && loan.endDate < today,
      expired: loan.status === "requested" && loan.endDate < today,
      cancellable: loan.status === "requested" || (loan.status === "approved" && loan.startDate > today),
      activity: await recentActivity(ctx, loan._id),
    });
  }
  return rows;
}

function safeToday(today: string) {
  return isIsoDate(today) ? today : "0000-01-01";
}

export const myRequests = query({
  args: { today: v.string() },
  returns: v.array(vLoanRow),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrowerId", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(100);
    return await toRows(ctx, loans, safeToday(args.today));
  },
});

export const incoming = query({
  args: { today: v.string() },
  returns: v.array(vLoanRow),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(100);
    return await toRows(ctx, loans, safeToday(args.today));
  },
});

export const listAll = query({
  args: { today: v.string() },
  returns: v.array(vLoanRow),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return await toRows(ctx, loans, safeToday(args.today));
  },
});
