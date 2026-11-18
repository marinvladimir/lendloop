"use client";

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function UserSync() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const synced = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      synced.current = false;
      return;
    }
    if (synced.current) return;
    synced.current = true;
    store().catch(() => {
      synced.current = false;
    });
  }, [isAuthenticated, store]);

  return null;
}
