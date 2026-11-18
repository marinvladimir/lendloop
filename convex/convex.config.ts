import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    N8N_LOAN_EVENT_WEBHOOK_URL: v.optional(v.string()),
    LENDLOOP_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

export default app;
