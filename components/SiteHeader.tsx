"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated, useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const links = [
  { href: "/board", label: "Board" },
  { href: "/board/listings", label: "My listings" },
  { href: "/board/requests", label: "My requests" },
  { href: "/board/incoming", label: "Incoming" },
];

function NavLinks() {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const all = me?.role === "admin" ? [...links, { href: "/admin", label: "Admin" }] : links;

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {all.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${
              active
                ? "border-emerald-600 font-medium text-stone-900 dark:text-white"
                : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SiteHeader({ showNav = false }: { showNav?: boolean }) {
  return (
    <header className="border-b border-stone-200 dark:border-stone-800">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-5 w-5 rounded-full border-[3px] border-emerald-600" aria-hidden />
          LendLoop
        </Link>
        <Unauthenticated>
          <SignInButton>
            <button className="text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white">
              Sign in
            </button>
          </SignInButton>
        </Unauthenticated>
        <Authenticated>
          <UserButton />
        </Authenticated>
      </div>
      {showNav && (
        <Authenticated>
          <div className="mx-auto max-w-5xl px-1 sm:px-4">
            <NavLinks />
          </div>
        </Authenticated>
      )}
    </header>
  );
}
