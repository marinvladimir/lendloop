"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/convex/model";
import { useMe } from "@/components/RequireAccount";
import {
  Button,
  CategoryBadge,
  Empty,
  ErrorText,
  Loading,
  PageTitle,
  TrustedBadge,
  errorMessage,
  formatDate,
  inputClass,
  localToday,
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

      <div className="mb-6 flex flex-wrap gap-2">
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
        <Loading />
      ) : tools.length === 0 ? (
        <Empty>No tools in this category yet.</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <ToolCard key={tool._id} tool={tool} today={today} />
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
      className={`rounded-full px-3 py-1 text-sm ${
        active
          ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
          : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      }`}
    >
      {children}
    </button>
  );
}

function Availability({ tool }: { tool: BoardTool }) {
  if (tool.availability.state === "on_loan") {
    return <span className="text-xs font-medium text-amber-700 dark:text-amber-400">On loan until {formatDate(tool.availability.until)}</span>;
  }
  return (
    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
      Available
      {tool.availability.nextBookedFrom && (
        <span className="font-normal text-stone-500"> · booked from {formatDate(tool.availability.nextBookedFrom)}</span>
      )}
    </span>
  );
}

function ToolCard({ tool, today }: { tool: BoardTool; today: string }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation(api.tools.remove);
  const canRemove = me.role === "admin" && !tool.isMine;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{tool.name}</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Condition: {tool.condition}
          </p>
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
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm(`Remove "${tool.name}" from the board?`)) return;
                try {
                  await remove({ toolId: tool._id });
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Remove
            </Button>
          )}
          {!tool.isMine && !open && tool.myOpenRequest && (
            <Link href="/board/requests" className="text-sm text-stone-500 underline-offset-2 hover:underline">
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
      {open && <RequestForm toolId={tool._id} today={today} onDone={() => setOpen(false)} />}
      <ErrorText message={error} />
    </li>
  );
}

function RequestForm({ toolId, today, onDone }: { toolId: BoardTool["_id"]; today: string; onDone: () => void }) {
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useMutation(api.loans.request);

  if (sent) {
    return (
      <p className="text-sm text-emerald-700 dark:text-emerald-400">
        Request sent. Track it under <Link className="underline" href="/board/requests">My requests</Link>.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg bg-stone-50 p-3 dark:bg-stone-900"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await request({ toolId, startDate, endDate });
          setSent(true);
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
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Send request
        </Button>
      </div>
    </form>
  );
}
