import { env, internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, sign } from "./signing";
import { vLoanStatus } from "./model";

export const vLoanEvent = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled_by_borrower"),
  v.literal("listing_removed"),
  v.literal("returned"),
);
export type LoanEvent = Infer<typeof vLoanEvent>;

const RETRY_DELAYS_MS = [30_000, 120_000, 600_000];
const REQUEST_TIMEOUT_MS = 10_000;

export async function queueLoanEvent(ctx: MutationCtx, loanId: Id<"loans">, event: LoanEvent) {
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { loanId, event, attempt: 1 });
}

const recipientIsOwner: Record<LoanEvent, boolean> = {
  requested: true,
  cancelled_by_borrower: true,
  approved: false,
  declined: false,
  listing_removed: false,
  returned: false,
};

export const buildPayload = internalQuery({
  args: { loanId: v.id("loans"), event: vLoanEvent },
  returns: v.union(
    v.null(),
    v.object({
      eventId: v.string(),
      event: vLoanEvent,
      recipient: v.object({ name: v.string(), email: v.string() }),
      counterpartName: v.string(),
      loan: v.object({
        id: v.id("loans"),
        toolName: v.string(),
        startDate: v.string(),
        endDate: v.string(),
        status: vLoanStatus,
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const loan = await ctx.db.get("loans", args.loanId);
    if (loan === null) return null;
    const tool = await ctx.db.get("tools", loan.toolId);
    const owner = await ctx.db.get("users", loan.ownerId);
    const borrower = await ctx.db.get("users", loan.borrowerId);
    if (tool === null || owner === null || borrower === null) return null;

    const [recipient, counterpart] = recipientIsOwner[args.event] ? [owner, borrower] : [borrower, owner];
    if (!recipient.email) return null;

    return {
      eventId: `${loan._id}:${args.event}`,
      event: args.event,
      recipient: { name: recipient.name, email: recipient.email },
      counterpartName: counterpart.name,
      loan: {
        id: loan._id,
        toolName: tool.name,
        startDate: loan.startDate,
        endDate: loan.endDate,
        status: loan.status,
      },
    };
  },
});

export const deliver = internalAction({
  args: { loanId: v.id("loans"), event: vLoanEvent, attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const idempotencyKey = `notify:${args.loanId}:${args.event}`;
    const record = (outcome: "sent" | "failed", detail: string) =>
      ctx.runMutation(internal.notifications.recordEvent, {
        loanId: args.loanId,
        kind: "request_notification",
        idempotencyKey,
        outcome,
        detail,
      });

    const url = env.N8N_LOAN_EVENT_WEBHOOK_URL;
    const secret = env.LENDLOOP_WEBHOOK_SECRET;
    if (!url || !secret) {
      await record("failed", "Webhook URL or secret is not configured");
      return null;
    }

    const payload = await ctx.runQuery(internal.notifications.buildPayload, { loanId: args.loanId, event: args.event });
    if (payload === null) {
      await record("failed", "Loan, tool or recipient email missing");
      return null;
    }

    const body = JSON.stringify({ ...payload, sentAt: new Date().toISOString() });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let problem: string;
    let retryable = true;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: await sign(secret, timestamp, body),
          "Idempotency-Key": idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        await record("sent", `Delivered on attempt ${args.attempt}`);
        return null;
      }
      problem = `n8n answered ${response.status}`;
      retryable = response.status >= 500 || response.status === 429;
    } catch (error) {
      problem = error instanceof Error ? error.message : "network error";
    }

    const delay = RETRY_DELAYS_MS[args.attempt - 1];
    if (retryable && delay !== undefined) {
      console.warn(`Loan event ${idempotencyKey} attempt ${args.attempt} failed (${problem}), retrying in ${delay / 1000}s`);
      await ctx.scheduler.runAfter(delay, internal.notifications.deliver, { ...args, attempt: args.attempt + 1 });
      return null;
    }

    console.error(`Loan event ${idempotencyKey} gave up after attempt ${args.attempt}: ${problem}`);
    await record("failed", `${problem} (attempt ${args.attempt})`);
    return null;
  },
});

export const recordEvent = internalMutation({
  args: {
    loanId: v.id("loans"),
    kind: v.union(v.literal("request_notification"), v.literal("overdue_reminder")),
    idempotencyKey: v.string(),
    outcome: v.union(v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
  },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing === null) {
      await ctx.db.insert("automationEvents", args);
      return { created: true };
    }
    if (existing.outcome === "failed" && args.outcome === "sent") {
      await ctx.db.patch("automationEvents", existing._id, { outcome: "sent", detail: args.detail });
    }
    return { created: false };
  },
});
