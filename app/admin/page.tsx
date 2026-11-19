"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMe } from "@/components/RequireAccount";
import { useToast } from "@/components/Toaster";
import { LoanList } from "@/components/LoanList";
import {
  Button,
  Empty,
  ErrorText,
  PageTitle,
  SkeletonRows,
  TrustedBadge,
  cardClass,
  errorMessage,
  localToday,
  stagger,
  timeAgo,
} from "@/components/ui";

export default function AdminPage() {
  const me = useMe();
  if (me.role !== "admin") {
    return <Empty icon="⛌">This page is only for admins.</Empty>;
  }
  return <AdminContent />;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">{children}</h2>;
}

function Stat({ label, value, tone = "neutral", index }: { label: string; value: number | undefined; tone?: "neutral" | "warn" | "bad"; index: number }) {
  const color =
    tone === "bad" && value ? "text-red-600 dark:text-red-400" : tone === "warn" && value ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <div className={`${cardClass} animate-fade-up px-4 py-3`} style={stagger(index)}>
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value ?? "…"}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

function AdminContent() {
  const loans = useQuery(api.loans.listAll, { today: localToday() });
  const users = useQuery(api.users.listForAdmin);
  const problems = useQuery(api.health.recentProblems);

  const active = loans?.filter((l) => l.status === "approved").length;
  const overdue = loans?.filter((l) => l.overdue).length;

  return (
    <>
      <PageTitle title="Admin" subtitle="Members, automation health and every loan. Listings can be removed from the Board." />

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Members" value={users?.length} index={0} />
        <Stat label="Active loans" value={active} index={1} />
        <Stat label="Overdue" value={overdue} tone="warn" index={2} />
        <Stat label="Automation problems" value={problems?.length} tone="bad" index={3} />
      </div>

      <section className="mb-10">
        <SectionTitle>Members</SectionTitle>
        {users === undefined ? (
          <SkeletonRows count={2} />
        ) : (
          <ul className={`${cardClass} animate-fade-up divide-y divide-stone-100 dark:divide-stone-800`}>
            {users.map((user) => (
              <MemberRow key={user._id} user={user} />
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <SectionTitle>Automation problems</SectionTitle>
        {problems === undefined ? (
          <SkeletonRows count={1} />
        ) : problems.length === 0 ? (
          <Empty icon="✓">No failed notifications, reminders or workflow runs.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {problems.map((problem, i) => (
              <li
                key={problem.id}
                className={`${cardClass} animate-fade-up border-l-4 border-l-red-400 px-5 py-4 dark:border-l-red-500`}
                style={stagger(i)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{problem.title}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500 dark:bg-stone-800">
                    {problem.source === "n8n" ? "n8n" : "Convex"} · {timeAgo(problem.at)}
                  </span>
                </div>
                <p className="mt-1.5 break-words font-mono text-xs text-red-700 dark:text-red-400">{problem.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>All loans</SectionTitle>
        <LoanList
          loans={loans}
          empty="No loans yet."
          describe={(loan) => `${loan.borrowerName} borrowing from ${loan.ownerName}`}
        />
      </section>
    </>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function MemberRow({
  user,
}: {
  user: { _id: Id<"users">; name: string; role: "admin" | "user"; trustedLender: boolean };
}) {
  const setTrusted = useMutation(api.users.setTrustedLender);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-sky-100 text-xs font-semibold text-emerald-800 dark:from-emerald-950 dark:to-sky-950 dark:text-emerald-300"
        >
          {initials(user.name)}
        </span>
        <span className="font-medium">{user.name}</span>
        {user.role === "admin" && (
          <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-white dark:text-stone-900">
            admin
          </span>
        )}
        {user.trustedLender && <TrustedBadge />}
        <ErrorText message={error} />
      </div>
      <Button
        variant={user.trustedLender ? "secondary" : "primary"}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await setTrusted({ userId: user._id, trusted: !user.trustedLender });
            toast(user.trustedLender ? `${user.name} is no longer a Trusted Lender` : `${user.name} is now a Trusted Lender`);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {user.trustedLender ? "Remove Trusted Lender" : "Mark as Trusted Lender"}
      </Button>
    </li>
  );
}
