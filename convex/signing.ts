const encoder = new TextEncoder();

export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const MAX_CLOCK_SKEW_SECONDS = 300;

async function hmacKey(secret: string) {
  return await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await hmacKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return `sha256=${toHex(mac)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function verify(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  body: string,
  nowSeconds: number,
): Promise<VerifyResult> {
  if (!timestamp || !signature) return { ok: false, reason: "missing signature headers" };
  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(nowSeconds - ts) > MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: "timestamp too old or in the future" };
  if (!signature.startsWith("sha256=")) return { ok: false, reason: "unsupported signature scheme" };
  const given = fromHex(signature.slice("sha256=".length));
  if (given === null) return { ok: false, reason: "malformed signature" };

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, given, encoder.encode(`${timestamp}.${body}`));
  return valid ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
