"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, type Category, type Condition } from "@/convex/model";
import { useToast } from "@/components/Toaster";
import {
  Button,
  CategoryBadge,
  ConfirmButton,
  Empty,
  ErrorText,
  PageTitle,
  SkeletonRows,
  cardClass,
  cardHoverClass,
  errorMessage,
  formatDate,
  inputClass,
  localToday,
  stagger,
} from "@/components/ui";

type MyTool = FunctionReturnType<typeof api.tools.listMine>[number];
type ToolInput = { name: string; category: Category; condition: Condition; description: string };

const emptyTool: ToolInput = { name: "", category: "power_tools", condition: "good", description: "" };

export default function ListingsPage() {
  const tools = useQuery(api.tools.listMine, { today: localToday() });
  const create = useMutation(api.tools.create);
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageTitle
        title="My listings"
        subtitle="Tools you are lending to the neighborhood."
        action={!adding && <Button onClick={() => setAdding(true)}>List a tool</Button>}
      />

      {adding && (
        <div className={`${cardClass} mb-6 animate-pop-in p-5`}>
          <h2 className="mb-3 font-medium">New listing</h2>
          <ToolForm
            initial={emptyTool}
            submitLabel="Add to board"
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              await create(values);
              setAdding(false);
              toast(`"${values.name.trim()}" is now on the board`);
            }}
          />
        </div>
      )}

      {tools === undefined ? (
        <SkeletonRows />
      ) : tools.length === 0 ? (
        !adding && (
          <Empty icon="＋">
            You have not listed anything yet.
            <Button className="mt-2" onClick={() => setAdding(true)}>
              List your first tool
            </Button>
          </Empty>
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {tools.map((tool, i) => (
            <ListingRow key={tool._id} tool={tool} index={i} />
          ))}
        </ul>
      )}
    </>
  );
}

function ListingRow({ tool, index }: { tool: MyTool; index: number }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);

  if (editing) {
    return (
      <li className={`${cardClass} animate-pop-in p-5`}>
        <ToolForm
          initial={tool}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await update({ toolId: tool._id, ...values });
            setEditing(false);
            toast("Changes saved");
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={`${cardClass} ${cardHoverClass} flex animate-fade-up flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`}
      style={stagger(index)}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">{tool.name}</h2>
          <CategoryBadge category={tool.category} />
        </div>
        <p className="mt-1 text-xs text-stone-500">
          <span className="capitalize">Condition: {tool.condition}</span> ·{" "}
          {tool.availability.state === "on_loan"
            ? tool.availability.overdue
              ? `Overdue since ${formatDate(tool.availability.until)}`
              : `On loan until ${formatDate(tool.availability.until)}`
            : "Available"}
          {tool.pendingRequests > 0 && (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {" "}
              · {tool.pendingRequests} open request{tool.pendingRequests > 1 ? "s" : ""}
            </span>
          )}
        </p>
        <ErrorText message={error} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <ConfirmButton
          label="Remove"
          confirmLabel="Remove and cancel requests"
          onConfirm={async () => {
            try {
              await remove({ toolId: tool._id });
              toast(`Removed "${tool.name}"`);
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        />
      </div>
    </li>
  );
}

function ToolForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ToolInput;
  submitLabel: string;
  onSubmit: (values: ToolInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ToolInput>({
    name: initial.name,
    category: initial.category,
    condition: initial.condition,
    description: initial.description,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ToolInput>(key: K, value: ToolInput[K]) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(values);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="text-xs text-stone-500">
        Name
        <input
          className={`${inputClass} mt-1`}
          value={values.name}
          maxLength={80}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Cordless drill"
          required
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-stone-500">
          Category
          <select
            className={`${inputClass} mt-1`}
            value={values.category}
            onChange={(e) => set("category", e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-stone-500">
          Condition
          <select
            className={`${inputClass} mt-1 capitalize`}
            value={values.condition}
            onChange={(e) => set("condition", e.target.value as Condition)}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-xs text-stone-500">
        Short description
        <textarea
          className={`${inputClass} mt-1`}
          rows={2}
          maxLength={500}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="What is included, anything to watch out for"
        />
      </label>
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
