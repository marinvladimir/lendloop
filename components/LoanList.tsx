"use client";

import { useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { useToast } from "./Toaster";
import {
  Button,
  Empty,
  ErrorText,
  SkeletonRows,
  StatusBadge,
  cardClass,
  errorMessage,
  formatRange,
  stagger,
  timeAgo,
} from "./ui";

export type LoanRow = FunctionReturnType<typeof api.loans.myRequests>[number];

export type LoanAction = {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  done: string;
  run: () => Promise<unknown>;
};

export function LoanList({
  loans,
  empty,
  describe,
  actions,
}: {
  loans: LoanRow[] | undefined;
  empty: string;
  describe: (loan: LoanRow) => ReactNode;
  actions?: (loan: LoanRow) => LoanAction[];
}) {
  if (loans === undefined) return <SkeletonRows />;
  if (loans.length === 0) return <Empty icon="⇄">{empty}</Empty>;
  return (
    <ul className="flex flex-col gap-3">
      {loans.map((loan, i) => (
        <LoanItem key={loan._id} loan={loan} index={i} describe={describe} actions={actions?.(loan) ?? []} />
      ))}
    </ul>
  );
}

function LoanItem({
  loan,
  index,
  describe,
  actions,
}: {
  loan: LoanRow;
  index: number;
  describe: (loan: LoanRow) => ReactNode;
  actions: LoanAction[];
}) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const faded = loan.status === "declined" || loan.status === "cancelled" || loan.expired;

  return (
    <li
      className={`${cardClass} flex animate-fade-up flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between ${
        loan.overdue ? "border-l-4 border-l-red-400 dark:border-l-red-500" : ""
      } ${faded ? "opacity-75" : ""}`}
      style={stagger(index)}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">{loan.toolName}</h2>
          <StatusBadge status={loan.status} overdue={loan.overdue} expired={loan.expired} />
          {loan.toolRemoved && <span className="text-xs text-stone-500">(listing removed)</span>}
        </div>
        <p className="mt-1 text-sm text-stone-500">
          {formatRange(loan.startDate, loan.endDate)} · {describe(loan)}
        </p>
        {loan.activity.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {loan.activity.map((item) => (
              <li
                key={`${item.label}-${item.at}`}
                className={`inline-flex items-center gap-1.5 ${
                  item.outcome === "failed" ? "text-red-600 dark:text-red-400" : "text-stone-500"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${item.outcome === "failed" ? "bg-red-500" : "bg-emerald-500"}`}
                />
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
              disabled={busy !== null && busy !== action.label}
              loading={busy === action.label}
              onClick={async () => {
                setBusy(action.label);
                setError(null);
                try {
                  await action.run();
                  toast(action.done);
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(null);
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
