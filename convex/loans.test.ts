/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const owner = { tokenIdentifier: "test|owner", subject: "owner", issuer: "test", name: "Olivia", email: "olivia@example.com" };
const borrower = { tokenIdentifier: "test|borrower", subject: "borrower", issuer: "test", name: "Ben", email: "ben@example.com" };
const other = { tokenIdentifier: "test|other", subject: "other", issuer: "test", name: "Oscar", email: "oscar@example.com" };
const admin = { tokenIdentifier: "test|admin", subject: "admin", issuer: "test", name: "Ada", email: "ada@example.com" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

function codeOf(promise: Promise<unknown>) {
  return promise.then(
    () => "OK",
    (e: { data?: { code?: string } }) => e.data?.code ?? "UNKNOWN",
  );
}

async function setup() {
  const t = convexTest(schema, modules);
  for (const who of [owner, borrower, other, admin]) {
    await t.withIdentity(who).mutation(api.users.store, {});
  }
  await t.mutation(internal.users.setRole, { email: admin.email, role: "admin" });
  const toolId = await t.withIdentity(owner).mutation(api.tools.create, {
    name: "  Ladder  ",
    category: "hand_tools",
    condition: "good",
    description: "Three metres",
  });
  return { t, toolId };
}

describe("tools", () => {
  test("anonymous visitors cannot see the full board or create listings", async () => {
    const t = convexTest(schema, modules);
    expect(await codeOf(t.query(api.tools.listBoard, { today: "2026-12-01" }))).toBe("UNAUTHENTICATED");
    expect(
      await codeOf(t.mutation(api.tools.create, { name: "X", category: "other", condition: "good", description: "" })),
    ).toBe("UNAUTHENTICATED");
  });

  test("names are trimmed and validated", async () => {
    const { t, toolId } = await setup();
    const board = await t.withIdentity(owner).query(api.tools.listBoard, { today: "2026-12-01" });
    expect(board.find((tool) => tool._id === toolId)?.name).toBe("Ladder");
    expect(
      await codeOf(
        t.withIdentity(owner).mutation(api.tools.create, { name: "   ", category: "other", condition: "good", description: "" }),
      ),
    ).toBe("INVALID");
  });

  test("only the owner edits, owner or admin removes", async () => {
    const { t, toolId } = await setup();
    const edit = { toolId, name: "Big ladder", category: "hand_tools" as const, condition: "fair" as const, description: "" };
    expect(await codeOf(t.withIdentity(other).mutation(api.tools.update, edit))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(admin).mutation(api.tools.update, edit))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(owner).mutation(api.tools.update, edit))).toBe("OK");

    expect(await codeOf(t.withIdentity(other).mutation(api.tools.remove, { toolId }))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(admin).mutation(api.tools.remove, { toolId }))).toBe("OK");
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  test("removing a listing cancels its open requests", async () => {
    const { t, toolId } = await setup();
    const loanId = await t
      .withIdentity(borrower)
      .mutation(api.loans.request, { toolId, startDate: "2026-12-05", endDate: "2026-12-06" });
    await t.withIdentity(owner).mutation(api.tools.remove, { toolId });
    const loan = await t.run((ctx) => ctx.db.get("loans", loanId));
    expect(loan?.status).toBe("cancelled");
  });
});

describe("loan lifecycle", () => {
  test("request, approve, return", async () => {
    const { t, toolId } = await setup();
    const loanId = await t
      .withIdentity(borrower)
      .mutation(api.loans.request, { toolId, startDate: "2026-12-01", endDate: "2026-12-03" });

    expect(await codeOf(t.withIdentity(borrower).mutation(api.loans.approve, { loanId }))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(other).mutation(api.loans.approve, { loanId }))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(owner).mutation(api.loans.approve, { loanId }))).toBe("OK");

    const board = await t.withIdentity(other).query(api.tools.listBoard, { today: "2026-12-02" });
    expect(board[0].availability).toEqual({ state: "on_loan", until: "2026-12-03" });

    expect(await codeOf(t.withIdentity(borrower).mutation(api.loans.markReturned, { loanId }))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(owner).mutation(api.loans.markReturned, { loanId }))).toBe("OK");
    expect(await codeOf(t.withIdentity(owner).mutation(api.loans.markReturned, { loanId }))).toBe("CONFLICT");
  });

  test("cannot borrow your own tool", async () => {
    const { t, toolId } = await setup();
    expect(
      await codeOf(t.withIdentity(owner).mutation(api.loans.request, { toolId, startDate: "2026-12-02", endDate: "2026-12-02" })),
    ).toBe("FORBIDDEN");
  });

  test("bad date ranges are rejected", async () => {
    const { t, toolId } = await setup();
    const ask = (startDate: string, endDate: string) =>
      codeOf(t.withIdentity(borrower).mutation(api.loans.request, { toolId, startDate, endDate }));
    expect(await ask("2026-12-05", "2026-12-04")).toBe("INVALID");
    expect(await ask("2026-11-01", "2026-11-02")).toBe("INVALID");
    expect(await ask("2026-12-01", "2027-02-01")).toBe("INVALID");
    expect(await ask("not-a-date", "2026-12-02")).toBe("INVALID");
    expect(await ask("2026-02-30", "2026-12-02")).toBe("INVALID");
  });

  test("overlapping approved loans are blocked", async () => {
    const { t, toolId } = await setup();
    const first = await t
      .withIdentity(borrower)
      .mutation(api.loans.request, { toolId, startDate: "2026-12-10", endDate: "2026-12-12" });
    const second = await t
      .withIdentity(other)
      .mutation(api.loans.request, { toolId, startDate: "2026-12-12", endDate: "2026-12-14" });

    await t.withIdentity(owner).mutation(api.loans.approve, { loanId: first });
    expect(await codeOf(t.withIdentity(owner).mutation(api.loans.approve, { loanId: second }))).toBe("CONFLICT");
    expect(
      await codeOf(t.withIdentity(other).mutation(api.loans.request, { toolId, startDate: "2026-12-11", endDate: "2026-12-11" })),
    ).toBe("CONFLICT");
  });

  test("only one open request per borrower per tool, and only the borrower cancels", async () => {
    const { t, toolId } = await setup();
    const loanId = await t
      .withIdentity(borrower)
      .mutation(api.loans.request, { toolId, startDate: "2026-12-05", endDate: "2026-12-06" });
    expect(
      await codeOf(t.withIdentity(borrower).mutation(api.loans.request, { toolId, startDate: "2026-12-20", endDate: "2026-12-21" })),
    ).toBe("CONFLICT");
    expect(await codeOf(t.withIdentity(owner).mutation(api.loans.cancel, { loanId }))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(borrower).mutation(api.loans.cancel, { loanId }))).toBe("OK");
  });

  test("each side only sees their own loans; admins see all", async () => {
    const { t, toolId } = await setup();
    await t.withIdentity(borrower).mutation(api.loans.request, { toolId, startDate: "2026-12-05", endDate: "2026-12-06" });

    expect(await t.withIdentity(borrower).query(api.loans.myRequests, { today: "2026-12-01" })).toHaveLength(1);
    expect(await t.withIdentity(owner).query(api.loans.incoming, { today: "2026-12-01" })).toHaveLength(1);
    expect(await t.withIdentity(other).query(api.loans.myRequests, { today: "2026-12-01" })).toHaveLength(0);
    expect(await t.withIdentity(other).query(api.loans.incoming, { today: "2026-12-01" })).toHaveLength(0);
    expect(await codeOf(t.withIdentity(owner).query(api.loans.listAll, { today: "2026-12-01" }))).toBe("FORBIDDEN");
    expect(await t.withIdentity(admin).query(api.loans.listAll, { today: "2026-12-01" })).toHaveLength(1);
  });

  test("approved loans past their end date are flagged overdue", async () => {
    const { t, toolId } = await setup();
    const loanId = await t
      .withIdentity(borrower)
      .mutation(api.loans.request, { toolId, startDate: "2026-12-01", endDate: "2026-12-02" });
    await t.withIdentity(owner).mutation(api.loans.approve, { loanId });
    const [row] = await t.withIdentity(owner).query(api.loans.incoming, { today: "2026-12-05" });
    expect(row.overdue).toBe(true);
  });
});
