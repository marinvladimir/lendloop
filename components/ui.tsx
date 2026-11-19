"use client";

import { ConvexError } from "convex/values";
import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
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

export function timeAgo(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function formatRange(startDate: string, endDate: string): string {
  return startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} to ${formatDate(endDate)}`;
}

export function stagger(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, 12) * 45}ms` };
}

export const cardClass =
  "rounded-2xl border border-stone-200/80 bg-white shadow-sm shadow-stone-200/40 transition-all duration-200 dark:border-stone-800 dark:bg-stone-900/60 dark:shadow-none";

export const cardHoverClass = "hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md dark:hover:border-stone-700";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:bg-emerald-600/50",
  secondary:
    "border border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50 dark:border-stone-700 dark:bg-transparent dark:text-stone-200 dark:hover:bg-stone-800",
  danger:
    "border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50 dark:border-red-900 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white",
};

function Spinner() {
  return <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function Button({
  variant = "primary",
  className = "",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100 ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  variant = "danger",
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  variant?: Variant;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <Button variant={variant} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex animate-pop-in items-center gap-1">
      <Button variant="ghost" onClick={() => setArmed(false)} disabled={busy}>
        Keep
      </Button>
      <Button
        variant="danger"
        className="!border-red-600 !bg-red-600 !text-white hover:!bg-red-700"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setArmed(false);
          }
        }}
      >
        {confirmLabel}
      </Button>
    </span>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex animate-fade-up flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
      {CATEGORY_LABELS[category]}
    </span>
  );
}

type BadgeKey = LoanStatus | "overdue" | "expired";

const statusStyles: Record<BadgeKey, string> = {
  requested: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  declined: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
  cancelled: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
  returned: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  expired: "bg-stone-100 text-stone-500 line-through decoration-stone-400 dark:bg-stone-800 dark:text-stone-400",
};

const statusLabels: Record<BadgeKey, string> = {
  requested: "Waiting for answer",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
  overdue: "Overdue",
  expired: "Expired",
};

export function StatusBadge({ status, overdue, expired }: { status: LoanStatus; overdue?: boolean; expired?: boolean }) {
  const key: BadgeKey = overdue ? "overdue" : expired ? "expired" : status;
  return (
    <span
      key={key}
      className={`animate-pop-in rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${statusStyles[key]}`}
    >
      {statusLabels[key]}
    </span>
  );
}

export function TrustedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
      <span aria-hidden>★</span>
      Trusted Lender
    </span>
  );
}

export function Empty({ children, icon = "○" }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex animate-fade-in flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-300 px-4 py-12 text-center text-sm text-stone-500 dark:border-stone-700">
      <span aria-hidden className="text-2xl text-stone-300 dark:text-stone-600">
        {icon}
      </span>
      {children}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <ul aria-hidden className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`${cardClass} flex flex-col gap-3 p-5`}>
          <div className="flex justify-between">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton h-4 w-16 rounded-full" />
          </div>
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-3 w-3/4 rounded" />
          <div className="mt-2 flex justify-between">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-7 w-32 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <ul aria-hidden className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`${cardClass} flex items-center justify-between gap-4 p-5`}>
          <div className="flex flex-col gap-2">
            <div className="skeleton h-4 w-40 rounded" />
            <div className="skeleton h-3 w-56 rounded" />
          </div>
          <div className="skeleton h-7 w-24 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex animate-fade-in items-center gap-2 text-sm text-stone-500">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="animate-fade-in text-sm text-red-600 dark:text-red-400">{message}</p>;
}

export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-stone-700 dark:bg-stone-900";
