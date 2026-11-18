"use client";

import { ConvexError } from "convex/values";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CATEGORY_LABELS, type Category, type LoanStatus } from "@/convex/model";

export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string } | string;
    if (typeof data === "string") return data;
    if (data?.message) return data.message;
  }
  return "Something went wrong. Please try again.";
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatRange(startDate: string, endDate: string): string {
  return startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} to ${formatDate(endDate)}`;
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50",
  secondary:
    "border border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800",
  danger: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950",
  ghost: "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
      {CATEGORY_LABELS[category]}
    </span>
  );
}

const statusStyles: Record<LoanStatus | "overdue", string> = {
  requested: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  declined: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
  cancelled: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
  returned: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const statusLabels: Record<LoanStatus | "overdue", string> = {
  requested: "Waiting for answer",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
  overdue: "Overdue",
};

export function StatusBadge({ status, overdue }: { status: LoanStatus; overdue?: boolean }) {
  const key = overdue ? "overdue" : status;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[key]}`}>{statusLabels[key]}</span>;
}

export function TrustedBadge() {
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
      Trusted Lender
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-500 dark:border-stone-700">
      {children}
    </div>
  );
}

export function Loading() {
  return <p className="text-sm text-stone-500">Loading…</p>;
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-stone-700";
