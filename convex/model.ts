import { v } from "convex/values";

export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const CONDITIONS = ["new", "good", "fair", "worn"] as const;

export const LOAN_STATUSES = [
  "requested",
  "approved",
  "declined",
  "cancelled",
  "returned",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const vCategory = v.union(...CATEGORIES.map((c) => v.literal(c)));
export const vCondition = v.union(...CONDITIONS.map((c) => v.literal(c)));
export const vLoanStatus = v.union(...LOAN_STATUSES.map((s) => v.literal(s)));
export const vRole = v.union(v.literal("admin"), v.literal("user"));
