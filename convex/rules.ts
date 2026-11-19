import { accessError } from "./access";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LOAN_DAYS = 30;

export const LIMITS = {
  toolName: 80,
  toolDescription: 500,
};

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function blockedUntil(loan: { endDate: string }, today: string): string {
  return loan.endDate < today ? "9999-12-31" : loan.endDate;
}

export function rangesOverlap(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function validateDateRange(startDate: string, endDate: string) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw accessError("INVALID", "Dates must look like 2026-12-31.");
  }
  if (startDate > endDate) throw accessError("INVALID", "The end date must be on or after the start date.");
  if (startDate < addDays(todayUtc(), -1)) throw accessError("INVALID", "The start date is in the past.");
  if (endDate > addDays(startDate, MAX_LOAN_DAYS - 1)) {
    throw accessError("INVALID", `Loans can last at most ${MAX_LOAN_DAYS} days.`);
  }
}

export function cleanText(value: string, field: string, max: number, required: boolean): string {
  const text = value.trim();
  if (required && text.length === 0) throw accessError("INVALID", `${field} is required.`);
  if (text.length > max) throw accessError("INVALID", `${field} can be at most ${max} characters.`);
  return text;
}
