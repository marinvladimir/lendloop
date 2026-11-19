/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { sign } from "./signing";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-secret";

const admin = { tokenIdentifier: "test|admin", subject: "admin", issuer: "test", name: "Ada", email: "ada@example.com" };
const user = { tokenIdentifier: "test|user", subject: "user", issuer: "test", name: "Ben", email: "ben@example.com" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
  vi.stubEnv("LENDLOOP_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("N8N_LOAN_EVENT_WEBHOOK_URL", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.withIdentity(admin).mutation(api.users.store, {});
  await t.withIdentity(user).mutation(api.users.store, {});
  await t.mutation(internal.users.setRole, { email: admin.email, role: "admin" });
  return t;
}

async function report(t: ReturnType<typeof convexTest>, body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  return await t.fetch("/n8n/workflow-error", {
    method: "POST",
    headers: { "X-LendLoop-Timestamp": ts, "X-LendLoop-Signature": await sign(secret, ts, raw) },
    body: raw,
  });
}

describe("workflow error reports", () => {
  test("a signed report is stored once per execution", async () => {
    const t = await setup();
    const body = { executionId: "42", workflow: "LendLoop: daily overdue reminders", node: "Fetch overdue loans", message: "timeout" };

    expect(await (await report(t, body)).json()).toEqual({ ok: true, created: true });
    expect(await (await report(t, body)).json()).toEqual({ ok: true, created: false });

    const rows = await t.run((ctx) => ctx.db.query("integrationFailures").collect());
    expect(rows).toMatchObject([{ externalId: "n8n:42", node: "Fetch overdue loans", message: "timeout" }]);
  });

  test("unsigned or malformed reports are refused", async () => {
    const t = await setup();
    expect((await report(t, { executionId: "1", workflow: "w", message: "m" }, "wrong")).status).toBe(401);
    expect((await report(t, { workflow: "w", message: "m" })).status).toBe(400);
    expect((await report(t, { executionId: "1", message: "m" })).status).toBe(400);
  });

  test("long messages are truncated", async () => {
    const t = await setup();
    await report(t, { executionId: "7", workflow: "w", message: "x".repeat(5000) });
    const [row] = await t.run((ctx) => ctx.db.query("integrationFailures").collect());
    expect(row.message).toHaveLength(500);
  });
});

describe("recentProblems", () => {
  test("is admin only and merges n8n and Convex failures", async () => {
    const t = await setup();
    await report(t, { executionId: "9", workflow: "LendLoop: error test", message: "boom" });

    const toolId = await t
      .withIdentity(admin)
      .mutation(api.tools.create, { name: "Drill", category: "power_tools", condition: "good", description: "" });
    await t.withIdentity(user).mutation(api.loans.request, { toolId, startDate: "2026-12-02", endDate: "2026-12-02" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(t.withIdentity(user).query(api.health.recentProblems, {})).rejects.toThrow();
    const problems = await t.withIdentity(admin).query(api.health.recentProblems, {});
    expect(problems.map((p) => p.source).sort()).toEqual(["convex", "n8n"]);
    expect(problems.find((p) => p.source === "convex")?.title).toBe("Loan notification for Drill");
  });
});
