"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">LendLoop</h1>
      <AuthLoading>
        <p className="text-sm text-gray-500">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <SignInButton>
          <button className="rounded bg-black px-4 py-2 text-white">Sign in</button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <UserButton />
        <ConvexViewer />
      </Authenticated>
    </main>
  );
}

function ConvexViewer() {
  const viewer = useQuery(api.viewer.current);
  if (viewer === undefined) return <p className="text-sm text-gray-500">Asking Convex…</p>;
  if (viewer === null) return <p className="text-sm text-red-600">Convex does not see you as signed in.</p>;
  return <p className="text-sm text-green-700">Convex sees you as: {viewer.name ?? "(no name)"}</p>;
}
