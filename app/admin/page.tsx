"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMe } from "@/components/RequireAccount";
import { LoanList } from "@/components/LoanList";
import { Button, Empty, ErrorText, Loading, PageTitle, TrustedBadge, errorMessage, localToday, timeAgo } from "@/components/ui";

export default function AdminPage() {
  const me = useMe();
  if (me.role !== "admin") {
    return <Empty>This page is only for admins.</Empty>;
  }
  return <AdminContent />;
}

function AdminContent() {
  const loans = useQuery(api.loans.listAll, { today: localToday() });
  const users = useQuery(api.users.listForAdmin);
  const problems = useQuery(api.health.recentProblems);

  return (
    <>
      <PageTitle title="Admin" subtitle="All loans and members. Listings can be removed from the Board." />

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">Members</h2>
        {users === undefined ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
            {users.map((user) => (
              <MemberRow key={user._id} user={user} />
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">Automation problems</h2>
        {problems === undefined ? (
          <Loading />
        ) : problems.length === 0 ? (
          <Empty>No failed notifications, reminders or workflow runs.</Empty>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-red-200 dark:divide-stone-800 dark:border-red-900">
            {problems.map((problem) => (
              <li key={problem.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{problem.title}</span>
                  <span className="text-xs text-stone-500">
                    {problem.source === "n8n" ? "n8n" : "Convex"} · {timeAgo(problem.at)}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm text-red-700 dark:text-red-400">{problem.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">All loans</h2>
        <LoanList
          loans={loans}
          empty="No loans yet."
          describe={(loan) => `${loan.borrowerName} borrowing from ${loan.ownerName}`}
        />
      </section>
    </>
  );
}

function MemberRow({
  user,
}: {
  user: { _id: Id<"users">; name: string; role: "admin" | "user"; trustedLender: boolean };
}) {
  const setTrusted = useMutation(api.users.setTrustedLender);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{user.name}</span>
        {user.role === "admin" && <span className="text-xs text-stone-500">admin</span>}
        {user.trustedLender && <TrustedBadge />}
        <ErrorText message={error} />
      </div>
      <Button
        variant={user.trustedLender ? "secondary" : "primary"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await setTrusted({ userId: user._id, trusted: !user.trustedLender });
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
