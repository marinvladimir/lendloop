"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Tone = "success" | "error";
type Toast = { id: number; message: string; tone: Tone; leaving: boolean };

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const VISIBLE_MS = 3200;
const LEAVE_MS = 250;

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
  }, []);

  const show = useCallback(
    (message: string, tone: Tone = "success") => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, tone, leaving: false }]);
      later(() => setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), VISIBLE_MS);
      later(() => setToasts((list) => list.filter((t) => t.id !== id)), VISIBLE_MS + LEAVE_MS);
    },
    [later],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 transition-all duration-200 ${
              toast.leaving ? "translate-y-2 opacity-0" : "animate-toast-in"
            } ${
              toast.tone === "success"
                ? "bg-stone-900 text-white ring-stone-800 dark:bg-white dark:text-stone-900 dark:ring-stone-200"
                : "bg-red-600 text-white ring-red-700"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                toast.tone === "success" ? "bg-emerald-500 text-white" : "bg-white/20"
              }`}
            >
              {toast.tone === "success" ? "✓" : "!"}
            </span>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
