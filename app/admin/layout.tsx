import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { RequireAccount } from "@/components/RequireAccount";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader showNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <RequireAccount>{children}</RequireAccount>
      </main>
    </>
  );
}
