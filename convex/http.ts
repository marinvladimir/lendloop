import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./signing";
import { addDays, isIsoDate, todayUtc } from "./rules";

const http = httpRouter();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function readSigned(req: Request): Promise<{ body: Record<string, unknown> } | { error: Response }> {
  const secret = env.LENDLOOP_WEBHOOK_SECRET;
  if (!secret) return { error: json(503, { error: "integration not configured" }) };

  const raw = await req.text();
  if (raw.length > 16_384) return { error: json(413, { error: "body too large" }) };

  const check = await verify(
    secret,
    req.headers.get(TIMESTAMP_HEADER),
    req.headers.get(SIGNATURE_HEADER),
    raw,
    Math.floor(Date.now() / 1000),
  );
  if (!check.ok) {
    console.warn(`Rejected n8n request to ${new URL(req.url).pathname}: ${check.reason}`);
    return { error: json(401, { error: "invalid signature" }) };
  }

  try {
    const body: unknown = JSON.parse(raw);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error();
    return { body: body as Record<string, unknown> };
  } catch {
    return { error: json(400, { error: "body must be a JSON object" }) };
  }
}

function validRunDate(value: unknown): value is string {
  if (typeof value !== "string" || !isIsoDate(value)) return false;
  const today = todayUtc();
  return value >= addDays(today, -1) && value <= addDays(today, 1);
}

http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const signed = await readSigned(req);
    if ("error" in signed) return signed.error;

    const { date } = signed.body;
    if (!validRunDate(date)) return json(400, { error: "date must be today's date as YYYY-MM-DD" });

    const loans = await ctx.runQuery(internal.reminders.listOverdue, { date });
    return json(200, { date, loans });
  }),
});

http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const signed = await readSigned(req);
    if ("error" in signed) return signed.error;

    const { loanId, date, outcome, detail } = signed.body;
    if (typeof loanId !== "string") return json(400, { error: "loanId is required" });
    if (!validRunDate(date)) return json(400, { error: "date must be today's date as YYYY-MM-DD" });
    if (outcome !== "sent" && outcome !== "failed") return json(400, { error: "outcome must be sent or failed" });
    if (detail !== undefined && typeof detail !== "string") return json(400, { error: "detail must be a string" });

    const result = await ctx.runMutation(internal.reminders.recordReminder, { loanId, date, outcome, detail });
    if (!result.ok) return json(404, { error: result.error });
    return json(200, { ok: true, created: result.created });
  }),
});

export default http;
