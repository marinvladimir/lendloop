/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { sign, verify } from "./signing";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-secret";
const URL = "https://n8n.example.test/webhook/lendloop-loan-event";

const owner = { tokenIdentifier: "test|owner", subject: "owner", issuer: "test", name: "Olivia", email: "olivia@example.com" };
const borrower = { tokenIdentifier: "test|borrower", subject: "borrower", issuer: "test", name: "Ben", email: "ben@example.com" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
  vi.stubEnv("N8N_LOAN_EVENT_WEBHOOK_URL", URL);
  vi.stubEnv("LENDLOOP_WEBHOOK_SECRET", SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.withIdentity(owner).mutation(api.users.store, {});
  await t.withIdentity(borrower).mutation(api.users.store, {});
  const toolId = await t
    .withIdentity(owner)
    .mutation(api.tools.create, { name: "Ladder", category: "hand_tools", condition: "good", description: "" });
  return { t, toolId };
}

function mockFetch(...statuses: number[]) {
  const calls: { headers: Record<string, string>; body: string }[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push({ headers: init.headers as Record<string, string>, body: init.body as string });
      const status = statuses[Math.min(i++, statuses.length - 1)];
      return new Response(null, { status });
    }),
  );
  return calls;
}

async function events(t: ReturnType<typeof convexTest>) {
  return await t.run((ctx) => ctx.db.query("automationEvents").collect());
}

describe("signing", () => {
  test("a signature verifies and any change breaks it", async () => {
    const now = 1_800_000_000;
    const body = '{"a":1}';
    const signature = await sign(SECRET, String(now), body);
    expect(await verify(SECRET, String(now), signature, body, now)).toEqual({ ok: true });
    expect((await verify(SECRET, String(now), signature, '{"a":2}', now)).ok).toBe(false);
    expect((await verify("other", String(now), signature, body, now)).ok).toBe(false);
    expect((await verify(SECRET, String(now), signature, body, now + 600)).ok).toBe(false);
    expect((await verify(SECRET, null, signature, body, now)).ok).toBe(false);
    expect((await verify(SECRET, String(now), "sha256=zz", body, now)).ok).toBe(false);
  });
});

describe("loan event webhook", () => {
  test("a new request is sent to n8n, signed, with only the fields it needs", async () => {
    const calls = mockFetch(200);
    const { t, toolId } = await setup();
    await t.withIdentity(borrower).mutation(api.loans.request, { toolId, startDate: "2026-12-02", endDate: "2026-12-03" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(1);
    const { headers, body } = calls[0];
    const check = await verify(
      SECRET,
      headers["X-LendLoop-Timestamp"],
      headers["X-LendLoop-Signature"],
      body,
      Math.floor(Date.now() / 1000),
    );
    expect(check).toEqual({ ok: true });

    const payload = JSON.parse(body);
    expect(payload.event).toBe("requested");
    expect(payload.recipient).toEqual({ name: "Olivia", email: "olivia@example.com" });
    expect(payload.counterpartName).toBe("Ben");
    expect(Object.keys(payload).sort()).toEqual(["counterpartName", "event", "eventId", "loan", "recipient", "sentAt"]);
    expect(body).not.toContain("ben@example.com");

    expect(await events(t)).toMatchObject([{ kind: "request_notification", outcome: "sent" }]);
  });

  test("server errors are retried and the event is recorded once", async () => {
    const calls = mockFetch(503, 502, 200);
    const { t, toolId } = await setup();
    await t.withIdentity(borrower).mutation(api.loans.request, { toolId, startDate: "2026-12-02", endDate: "2026-12-03" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(3);
    const all = await events(t);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ outcome: "sent", detail: "Delivered on attempt 3" });
  });

  test("gives up after the last retry and records a visible failure", async () => {
    const calls = mockFetch(500);
    const { t, toolId } = await setup();
    await t.withIdentity(borrower).mutation(api.loans.request, { toolId, startDate: "2026-12-02", endDate: "2026-12-03" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(4);
    expect(await events(t)).toMatchObject([{ outcome: "failed" }]);
  });

  test("a rejected signature is not retried", async () => {
    const calls = mockFetch(401);
    const { t, toolId } = await setup();
    await t.withIdentity(borrower).mutation(api.loans.request, { toolId, startDate: "2026-12-02", endDate: "2026-12-03" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(1);
    expect(await events(t)).toMatchObject([{ outcome: "failed" }]);
  });

  test("missing configuration is recorded instead of failing silently", async () => {
    vi.stubEnv("N8N_LOAN_EVENT_WEBHOOK_URL", "");
    const calls = mockFetch(200);
    const { t, toolId } = await setup();
    await t.withIdentity(borrower).mutation(api.loans.request, { toolId, startDate: "2026-12-02", endDate: "2026-12-03" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(0);
    expect(await events(t)).toMatchObject([{ outcome: "failed" }]);
  });

  test("approval notifies the borrower", async () => {
    const calls = mockFetch(200);
    const { t, toolId } = await setup();
    const loanId = await t
      .withIdentity(borrower)
      .mutation(api.loans.request, { toolId, startDate: "2026-12-02", endDate: "2026-12-03" });
    await t.withIdentity(owner).mutation(api.loans.approve, { loanId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const approved = calls.map((c) => JSON.parse(c.body)).find((p) => p.event === "approved");
    expect(approved.recipient.email).toBe("ben@example.com");
  });

  test("recordEvent is idempotent per key", async () => {
    const { t, toolId } = await setup();
    const loanId = await t.run(async (ctx) => {
      const userId = (await ctx.db.query("users").first())!._id;
      return await ctx.db.insert("loans", {
        toolId,
        ownerId: userId,
        borrowerId: userId,
        startDate: "2026-12-02",
        endDate: "2026-12-03",
        status: "approved",
      });
    });
    const args = { loanId, kind: "overdue_reminder" as const, idempotencyKey: "k1", outcome: "sent" as const };
    expect(await t.mutation(internal.notifications.recordEvent, args)).toEqual({ created: true });
    expect(await t.mutation(internal.notifications.recordEvent, args)).toEqual({ created: false });
    expect(await events(t)).toHaveLength(1);
  });
});
