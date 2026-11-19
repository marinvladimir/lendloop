"use client";

import { useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Button, Empty, ErrorText, Loading, StatusBadge, errorMessage, formatRange, timeAgo } from "./ui";

export type LoanRow = FunctionReturnType<typeof api.loans.myRequests>[number];

export function LoanList({
  loans,
  empty,
  describe,
  actions,
}: {
  loans: LoanRow[] | undefined;
  empty: string;
  describe: (loan: LoanRow) => ReactNode;
  actions?: (loan: LoanRow) => { label: string; variant?: "primary" | "secondary" | "danger"; run: () => Promise<unknown> }[];
}) {
  if (loans === undefined) return <Loading />;
  if (loans.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-col gap-3">
      {loans.map((loan) => (
        <LoanItem key={loan._id} loan={loan} describe={describe} actions={actions?.(loan) ?? []} />
      ))}
    </ul>
  );
}

function LoanItem({
  loan,
  describe,
  actions,
}: {
  loan: LoanRow;
  describe: (loan: LoanRow) => ReactNode;
  actions: { label: string; variant?: "primary" | "secondary" | "danger"; run: () => Promise<unknown> }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">{loan.toolName}</h2>
          <StatusBadge status={loan.status} overdue={loan.overdue} />
          {loan.toolRemoved && <span className="text-xs text-stone-500">(listing removed)</span>}
        </div>
        <p className="mt-1 text-sm text-stone-500">
          {formatRange(loan.startDate, loan.endDate)} · {describe(loan)}
        </p>
        {loan.activity.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {loan.activity.map((item) => (
              <li
                key={`${item.label}-${item.at}`}
                className={item.outcome === "failed" ? "text-red-600 dark:text-red-400" : "text-stone-500"}
              >
                {item.label} {timeAgo(item.at)}
              </li>
            ))}
          </ul>
        )}
        <ErrorText message={error} />
      </div>
      {actions.length > 0 && (
        <div className="flex shrink-0 gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "secondary"}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await action.run();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
