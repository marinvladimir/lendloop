/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  requireAdmin,
  requireLoanBorrower,
  requireLoanLender,
  requireLoanParticipantOrAdmin,
  requireToolOwner,
  requireToolOwnerOrAdmin,
  requireUser,
} from "./access";

const modules = import.meta.glob("./**/*.ts");

const alice = { tokenIdentifier: "test|alice", subject: "alice", issuer: "test", name: "Alice", email: "alice@example.com" };
const bob = { tokenIdentifier: "test|bob", subject: "bob", issuer: "test", name: "Bob", email: "bob@example.com" };
const carol = { tokenIdentifier: "test|carol", subject: "carol", issuer: "test", name: "Carol", email: "carol@example.com" };

async function setup() {
  const t = convexTest(schema, modules);
  const aliceId = await t.withIdentity(alice).mutation(api.users.store, {});
  const bobId = await t.withIdentity(bob).mutation(api.users.store, {});
  const carolId = await t.withIdentity(carol).mutation(api.users.store, {});
  await t.mutation(internal.users.setRole, { email: carol.email, role: "admin" });

  const { toolId, loanId } = await t.run(async (ctx) => {
    const toolId = await ctx.db.insert("tools", {
      ownerId: aliceId,
      name: "Drill",
      category: "power_tools",
      condition: "good",
      description: "",
    });
    const loanId = await ctx.db.insert("loans", {
      toolId,
      ownerId: aliceId,
      borrowerId: bobId,
      startDate: "2026-12-01",
      endDate: "2026-12-03",
      status: "requested",
    });
    return { toolId, loanId };
  });

  return { t, aliceId, bobId, carolId, toolId, loanId };
}

function codeOf(promise: Promise<unknown>) {
  return promise.then(
    () => "OK",
    (e: { data?: { code?: string } }) => e.data?.code ?? "UNKNOWN",
  );
}

describe("users.store", () => {
  test("refuses anonymous callers", async () => {
    const t = convexTest(schema, modules);
    expect(await codeOf(t.mutation(api.users.store, {}))).toBe("UNAUTHENTICATED");
  });

  test("creates a plain user once and reuses the row afterwards", async () => {
    const t = convexTest(schema, modules);
    const first = await t.withIdentity(alice).mutation(api.users.store, {});
    const second = await t.withIdentity(alice).mutation(api.users.store, {});
    expect(second).toBe(first);
    const me = await t.withIdentity(alice).query(api.users.me, {});
    expect(me).toMatchObject({ name: "Alice", role: "user", trustedLender: false });
  });
});

describe("users.setTrustedLender", () => {
  test("only admins can mark a trusted lender", async () => {
    const { t, aliceId } = await setup();
    const args = { userId: aliceId, trusted: true };

    expect(await codeOf(t.mutation(api.users.setTrustedLender, args))).toBe("UNAUTHENTICATED");
    expect(await codeOf(t.withIdentity(bob).mutation(api.users.setTrustedLender, args))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(alice).mutation(api.users.setTrustedLender, args))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(carol).mutation(api.users.setTrustedLender, args))).toBe("OK");

    const me = await t.withIdentity(alice).query(api.users.me, {});
    expect(me?.trustedLender).toBe(true);
  });
});

describe("access helpers", () => {
  test("signed in but not stored yet is not enough", async () => {
    const t = convexTest(schema, modules);
    const stranger = { ...alice, tokenIdentifier: "test|stranger" };
    expect(await codeOf(t.withIdentity(stranger).run((ctx) => requireUser(ctx)))).toBe("NO_ACCOUNT");
  });

  test("requireAdmin", async () => {
    const { t } = await setup();
    expect(await codeOf(t.withIdentity(bob).run((ctx) => requireAdmin(ctx)))).toBe("FORBIDDEN");
    expect(await codeOf(t.withIdentity(carol).run((ctx) => requireAdmin(ctx)))).toBe("OK");
  });

  test("requireToolOwner lets only the owner edit, not even an admin", async () => {
    const { t, toolId } = await setup();
    const check = (who: typeof alice) => codeOf(t.withIdentity(who).run((ctx) => requireToolOwner(ctx, toolId)));
    expect(await check(alice)).toBe("OK");
    expect(await check(bob)).toBe("FORBIDDEN");
    expect(await check(carol)).toBe("FORBIDDEN");
  });

  test("requireToolOwnerOrAdmin lets the owner or an admin remove", async () => {
    const { t, toolId } = await setup();
    const check = (who: typeof alice) => codeOf(t.withIdentity(who).run((ctx) => requireToolOwnerOrAdmin(ctx, toolId)));
    expect(await check(alice)).toBe("OK");
    expect(await check(bob)).toBe("FORBIDDEN");
    expect(await check(carol)).toBe("OK");
  });

  test("removed tools count as missing", async () => {
    const { t, toolId } = await setup();
    await t.run((ctx) => ctx.db.patch("tools", toolId, { removedAt: Date.now() }));
    expect(await codeOf(t.withIdentity(alice).run((ctx) => requireToolOwner(ctx, toolId)))).toBe("NOT_FOUND");
  });

  test("loan roles are kept apart", async () => {
    const { t, loanId } = await setup();
    const lender = (who: typeof alice) => codeOf(t.withIdentity(who).run((ctx) => requireLoanLender(ctx, loanId)));
    const borrower = (who: typeof alice) => codeOf(t.withIdentity(who).run((ctx) => requireLoanBorrower(ctx, loanId)));
    const viewer = (who: typeof alice) =>
      codeOf(t.withIdentity(who).run((ctx) => requireLoanParticipantOrAdmin(ctx, loanId)));

    expect(await lender(alice)).toBe("OK");
    expect(await lender(bob)).toBe("FORBIDDEN");
    expect(await borrower(bob)).toBe("OK");
    expect(await borrower(alice)).toBe("FORBIDDEN");

    const dave = { ...alice, tokenIdentifier: "test|dave", email: "dave@example.com", name: "Dave" };
    await t.withIdentity(dave).mutation(api.users.store, {});
    expect(await viewer(dave)).toBe("FORBIDDEN");
    expect(await viewer(carol)).toBe("OK");
  });

  test("unknown ids are reported as missing", async () => {
    const { t, loanId, toolId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.delete("loans", loanId);
      await ctx.db.delete("tools", toolId);
    });
    expect(await codeOf(t.withIdentity(alice).run((ctx) => requireLoanLender(ctx, loanId as Id<"loans">)))).toBe("NOT_FOUND");
    expect(await codeOf(t.withIdentity(alice).run((ctx) => requireToolOwner(ctx, toolId)))).toBe("NOT_FOUND");
  });
});
