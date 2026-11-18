/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { sign } from "./signing";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-secret";
const TODAY = "2026-12-10";

const owner = { tokenIdentifier: "test|owner", subject: "owner", issuer: "test", name: "Olivia", email: "olivia@example.com" };
const borrower = { tokenIdentifier: "test|borrower", subject: "borrower", issuer: "test", name: "Ben", email: "ben@example.com" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T07:00:00Z`));
  vi.stubEnv("LENDLOOP_WEBHOOK_SECRET", SECRET);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
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

  const loanId = await t.run(async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const ownerId = users.find((u) => u.name === "Olivia")!._id;
    const borrowerId = users.find((u) => u.name === "Ben")!._id;
    await ctx.db.insert("loans", {
      toolId,
      ownerId,
      borrowerId,
      startDate: "2026-12-09",
      endDate: "2026-12-12",
      status: "approved",
    });
    return await ctx.db.insert("loans", {
      toolId,
      ownerId,
      borrowerId,
      startDate: "2026-12-01",
      endDate: "2026-12-07",
      status: "approved",
    });
  });
  return { t, loanId };
}

async function signed(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LendLoop-Timestamp": ts,
      "X-LendLoop-Signature": await sign(secret, ts, raw),
    },
    body: raw,
  };
}

describe("overdue endpoint", () => {
  test("returns only overdue approved loans with the fields a reminder needs", async () => {
    const { t, loanId } = await setup();
    const res = await t.fetch("/n8n/overdue-loans", await signed({ date: TODAY }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.loans).toHaveLength(1);
    expect(body.loans[0]).toEqual({
      loanId,
      reminderKey: `reminder:${loanId}:${TODAY}`,
      borrower: { name: "Ben", email: "ben@example.com" },
      lenderName: "Olivia",
      toolName: "Ladder",
      endDate: "2026-12-07",
      daysOverdue: 3,
    });
    expect(JSON.stringify(body)).not.toContain("olivia@example.com");
  });

  test("rejects unsigned, wrongly signed and replayed requests", async () => {
    const { t } = await setup();
    const unsigned = await t.fetch("/n8n/overdue-loans", { method: "POST", body: JSON.stringify({ date: TODAY }) });
    expect(unsigned.status).toBe(401);

    const wrong = await t.fetch("/n8n/overdue-loans", await signed({ date: TODAY }, "not-the-secret"));
    expect(wrong.status).toBe(401);

    const request = await signed({ date: TODAY });
    vi.setSystemTime(new Date(`${TODAY}T07:10:00Z`));
    const replay = await t.fetch("/n8n/overdue-loans", request);
    expect(replay.status).toBe(401);
  });

  test("rejects dates far from today", async () => {
    const { t } = await setup();
    const res = await t.fetch("/n8n/overdue-loans", await signed({ date: "2027-01-01" }));
    expect(res.status).toBe(400);
  });
});

describe("reminder write-back", () => {
  test("is idempotent per loan and day, and hides reminded loans from the next fetch", async () => {
    const { t, loanId } = await setup();
    const write = async () =>
      (await t.fetch("/n8n/reminder-status", await signed({ loanId, date: TODAY, outcome: "sent", detail: "mock" }))).json();

    expect(await write()).toEqual({ ok: true, created: true });
    expect(await write()).toEqual({ ok: true, created: false });

    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events.filter((e) => e.kind === "overdue_reminder")).toHaveLength(1);

    const again = await (await t.fetch("/n8n/overdue-loans", await signed({ date: TODAY }))).json();
    expect(again.loans).toHaveLength(0);
  });

  test("a failed attempt can later be upgraded to sent, never the other way", async () => {
    const { t, loanId } = await setup();
    await t.fetch("/n8n/reminder-status", await signed({ loanId, date: TODAY, outcome: "failed" }));
    await t.fetch("/n8n/reminder-status", await signed({ loanId, date: TODAY, outcome: "sent" }));
    await t.fetch("/n8n/reminder-status", await signed({ loanId, date: TODAY, outcome: "failed" }));
    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events).toMatchObject([{ kind: "overdue_reminder", outcome: "sent" }]);
  });

  test("validates the body", async () => {
    const { t, loanId } = await setup();
    const bad = async (body: unknown) => (await t.fetch("/n8n/reminder-status", await signed(body))).status;
    expect(await bad({ date: TODAY, outcome: "sent" })).toBe(400);
    expect(await bad({ loanId, date: TODAY, outcome: "maybe" })).toBe(400);
    expect(await bad({ loanId: "not-an-id", date: TODAY, outcome: "sent" })).toBe(404);
    expect(await bad([1, 2])).toBe(400);
  });
});
