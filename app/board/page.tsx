"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/convex/model";
import { useMe } from "@/components/RequireAccount";
import { useToast } from "@/components/Toaster";
import {
  Button,
  CategoryBadge,
  ConfirmButton,
  Empty,
  ErrorText,
  PageTitle,
  SkeletonCards,
  TrustedBadge,
  cardClass,
  cardHoverClass,
  errorMessage,
  formatDate,
  inputClass,
  localToday,
  stagger,
} from "@/components/ui";

type BoardTool = FunctionReturnType<typeof api.tools.listBoard>[number];

export default function BoardPage() {
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const today = localToday();
  const tools = useQuery(api.tools.listBoard, { category, today });

  return (
    <>
      <PageTitle
        title="Board"
        subtitle="Everything your neighbors are lending right now."
        action={
          <Link href="/board/listings">
            <Button>List a tool</Button>
          </Link>
        }
      />

      <div className="mb-6 flex animate-fade-up flex-wrap gap-2" style={stagger(1)}>
        <FilterChip active={category === undefined} onClick={() => setCategory(undefined)}>
          All
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABELS[c]}
          </FilterChip>
        ))}
      </div>

      {tools === undefined ? (
        <SkeletonCards />
      ) : tools.length === 0 ? (
        <Empty icon="⌕">No tools in this category yet.</Empty>
      ) : (
        <ul key={category ?? "all"} className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool, i) => (
            <ToolCard key={tool._id} tool={tool} today={today} index={i} />
          ))}
        </ul>
      )}
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-sm transition-all duration-200 active:scale-95 ${
        active
          ? "bg-stone-900 text-white shadow-sm dark:bg-white dark:text-stone-900"
          : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50 hover:ring-stone-300 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800 dark:hover:bg-stone-800"
      }`}
    >
      {children}
    </button>
  );
}

function Availability({ tool }: { tool: BoardTool }) {
  const a = tool.availability;
  if (a.state === "on_loan") {
    return a.overdue ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Overdue since {formatDate(a.until)}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        On loan until {formatDate(a.until)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Available
      {a.nextBookedFrom && <span className="font-normal text-stone-500">· booked from {formatDate(a.nextBookedFrom)}</span>}
    </span>
  );
}

function ToolCard({ tool, today, index }: { tool: BoardTool; today: string; index: number }) {
  const me = useMe();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation(api.tools.remove);
  const canRemove = me.role === "admin" && !tool.isMine;

  return (
    <li className={`${cardClass} ${cardHoverClass} flex animate-fade-up flex-col gap-3 p-5`} style={stagger(index)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{tool.name}</h2>
          <p className="mt-0.5 text-xs capitalize text-stone-500">Condition: {tool.condition}</p>
        </div>
        <CategoryBadge category={tool.category} />
      </div>
      {tool.description && <p className="text-sm text-stone-600 dark:text-stone-400">{tool.description}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span>{tool.isMine ? "Your listing" : `Lent by ${tool.ownerName}`}</span>
        {tool.ownerTrusted && <TrustedBadge />}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 dark:border-stone-800">
        <Availability tool={tool} />
        <div className="flex items-center gap-2">
          {canRemove && (
            <ConfirmButton
              label="Remove"
              confirmLabel="Remove listing"
              onConfirm={async () => {
                try {
                  await remove({ toolId: tool._id });
                  toast(`Removed "${tool.name}" from the board`);
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            />
          )}
          {!tool.isMine && !open && tool.myOpenRequest && (
            <Link
              href="/board/requests"
              className="inline-flex items-center gap-1 text-sm text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline dark:hover:text-stone-200"
            >
              <span aria-hidden className="text-emerald-600">✓</span>
              Request sent
            </Link>
          )}
          {!tool.isMine && !open && !tool.myOpenRequest && (
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Request to borrow
            </Button>
          )}
        </div>
      </div>
      {open && <RequestForm tool={tool} today={today} onDone={() => setOpen(false)} />}
      <ErrorText message={error} />
    </li>
  );
}

function RequestForm({ tool, today, onDone }: { tool: BoardTool; today: string; onDone: () => void }) {
  const toast = useToast();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useMutation(api.loans.request);

  return (
    <form
      className="flex animate-pop-in flex-col gap-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200 dark:bg-stone-950 dark:ring-stone-800"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await request({ toolId: tool._id, startDate, endDate });
          toast(`Request sent to ${tool.ownerName}`);
          onDone();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-stone-500">
          From
          <input
            type="date"
            className={`${inputClass} mt-1`}
            min={today}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (e.target.value > endDate) setEndDate(e.target.value);
            }}
            required
          />
        </label>
        <label className="text-xs text-stone-500">
          Until
          <input
            type="date"
            className={`${inputClass} mt-1`}
            min={startDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </label>
      </div>
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          Send request
        </Button>
      </div>
    </form>
  );
}
