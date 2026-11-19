"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Loading } from "./ui";

type Me = NonNullable<FunctionReturnType<typeof api.users.me>>;

const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (me === null) throw new Error("useMe must be used inside RequireAccount");
  return me;
}

export function RequireAccount({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (isLoading || (isAuthenticated && me === undefined)) return <Loading />;
  if (!isAuthenticated) return <p className="animate-fade-in text-sm text-stone-500">Please sign in to continue.</p>;
  if (me === null || me === undefined) return <Loading label="Setting up your account…" />;

  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}
