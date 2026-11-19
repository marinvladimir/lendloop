"use client";

import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SiteHeader } from "@/components/SiteHeader";
import { CategoryBadge, Empty, cardClass, cardHoverClass, stagger } from "@/components/ui";

const ctaClass =
  "inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/30 active:translate-y-0 active:scale-[0.98]";

const steps = [
  { title: "List what you have", text: "Add the drill, the tent or the mixer you rarely use. It takes a minute." },
  { title: "Ask for a date range", text: "Pick the days you need something. The lender approves or declines." },
  { title: "Get reminded", text: "Notifications and overdue reminders run automatically, so nobody has to chase." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="w-full flex-1">
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -left-24 -top-24 h-80 w-80 animate-float rounded-full bg-emerald-200/50 blur-3xl dark:bg-emerald-900/30" />
            <div
              className="absolute -right-16 top-24 h-72 w-72 animate-float rounded-full bg-sky-200/50 blur-3xl dark:bg-sky-900/30"
              style={{ animationDelay: "-3s" }}
            />
            <div
              className="absolute bottom-0 left-1/3 h-56 w-56 animate-float rounded-full bg-amber-100/60 blur-3xl dark:bg-amber-900/20"
              style={{ animationDelay: "-6s" }}
            />
          </div>

          <div className="mx-auto max-w-5xl px-4 py-20 sm:py-28">
            <p
              className="mb-5 inline-flex animate-fade-up items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 backdrop-blur dark:bg-stone-900/60 dark:text-emerald-300 dark:ring-emerald-900"
              style={stagger(0)}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Neighborhood tool lending
            </p>
            <h1
              className="max-w-3xl animate-fade-up text-4xl font-semibold tracking-tight sm:text-6xl"
              style={stagger(1)}
            >
              Borrow what you need.{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-sky-600 bg-clip-text text-transparent">
                Lend what you don&apos;t.
              </span>
            </h1>
            <p className="mt-5 max-w-xl animate-fade-up text-lg text-stone-600 dark:text-stone-400" style={stagger(2)}>
              A lending board for your street. List the tools sitting in your shed and borrow the ones you only need once a
              year.
            </p>
            <div className="mt-9 animate-fade-up" style={stagger(3)}>
              <Unauthenticated>
                <SignInButton>
                  <button className={ctaClass}>
                    Sign in to lend or borrow
                    <span aria-hidden>→</span>
                  </button>
                </SignInButton>
              </Unauthenticated>
              <Authenticated>
                <Link href="/board" className={ctaClass}>
                  Open the board
                  <span aria-hidden>→</span>
                </Link>
              </Authenticated>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-6">
          <ol className="grid gap-4 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className={`${cardClass} animate-fade-up p-5`} style={stagger(i + 4)}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <h2 className="mt-3 font-medium">{step.title}</h2>
                <p className="mt-1 text-sm text-stone-500">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20 pt-10">
          <ToolList />
        </section>
      </main>
    </>
  );
}

function ToolList() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">On the board</h2>
        {tools !== undefined && tools.length > 0 && (
          <span className="animate-fade-in text-xs text-stone-500">
            {tools.length} {tools.length === 1 ? "tool" : "tools"}
          </span>
        )}
      </div>
      {tools === undefined ? (
        <ul aria-hidden className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className={`${cardClass} flex items-center justify-between px-4 py-3.5`}>
              <div className="skeleton h-4 w-28 rounded" />
              <div className="skeleton h-4 w-16 rounded-full" />
            </li>
          ))}
        </ul>
      ) : tools.length === 0 ? (
        <Empty>Nothing listed yet.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool, i) => (
            <li
              key={`${tool.category}-${tool.name}-${i}`}
              className={`${cardClass} ${cardHoverClass} flex animate-fade-up items-center justify-between gap-3 px-4 py-3.5`}
              style={stagger(i)}
            >
              <span className="font-medium">{tool.name}</span>
              <CategoryBadge category={tool.category} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
