"use client";

import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/convex/model";
import { SiteHeader } from "@/components/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
        <section className="py-16 sm:py-24">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Borrow what you need. Lend what you don&apos;t.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-stone-600 dark:text-stone-400">
            A lending board for your street. List the tools sitting in your shed and borrow the ones you only need once a year.
          </p>
          <div className="mt-8">
            <Unauthenticated>
              <SignInButton>
                <button className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">
                  Sign in to lend or borrow
                </button>
              </SignInButton>
            </Unauthenticated>
            <Authenticated>
              <Link
                href="/board"
                className="inline-block rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Open the board
              </Link>
            </Authenticated>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-stone-500">On the board</h2>
          <ToolList />
        </section>
      </main>
    </>
  );
}

function ToolList() {
  const tools = useQuery(api.tools.listPublic);

  if (tools === undefined) {
    return <p className="mt-4 text-sm text-stone-500">Loading tools…</p>;
  }
  if (tools.length === 0) {
    return <p className="mt-4 text-sm text-stone-500">Nothing listed yet.</p>;
  }

  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool, i) => (
        <li
          key={`${tool.category}-${tool.name}-${i}`}
          className="flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3 dark:border-stone-800"
        >
          <span className="font-medium">{tool.name}</span>
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {CATEGORY_LABELS[tool.category]}
          </span>
        </li>
      ))}
    </ul>
  );
}
