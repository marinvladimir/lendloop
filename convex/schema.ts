import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vCategory, vCondition, vLoanStatus, vRole } from "./model";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    role: vRole,
    trustedLender: v.boolean(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: vCategory,
    condition: vCondition,
    description: v.string(),
    removedAt: v.optional(v.number()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_removedAt_and_category", ["removedAt", "category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: vLoanStatus,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_toolId_and_status", ["toolId", "status"])
    .index("by_borrowerId", ["borrowerId"])
    .index("by_ownerId", ["ownerId"])
    .index("by_status_and_endDate", ["status", "endDate"]),

  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: v.union(v.literal("request_notification"), v.literal("overdue_reminder")),
    idempotencyKey: v.string(),
    outcome: v.union(v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_loanId", ["loanId"]),
});
