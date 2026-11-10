/**
 * Mint {{verify_url}} from SessionCloud at send time.
 * Marketing signs the request with WEBHOOK_SECRET (same HMAC-SHA256(raw body)
 * scheme as the inbound webhooks, plus a unix `ts` replay window). SessionCloud
 * signs the returned link with CONFIRM_EMAIL_SECRET, which marketing must not hold.
 *
 * POST {SESSIONCLOUD_API_URL}/api/v1/marketing/confirm-email-url
 * Body: { objectId, ts }  Header: x-webhook-signature
 * 200 { url, exp } | 409 already verified | other failure → hold
 */
import { createHmac } from "node:crypto";

export const CONFIRM_EMAIL_MINT_PATH = "/api/v1/marketing/confirm-email-url";
export const DEFAULT_SESSIONCLOUD_API_URL = "https://cloud.sessiontalk.io";
export const WEBHOOK_REPLAY_WINDOW_SECONDS = 5 * 60;
export const MINT_TIMEOUT_MS = 5000;

export function marketingWebhookSignature(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export type MintResult =
  | { ok: true; url: string; exp: number }
  | { ok: false; reason: "already_verified" }
  | { ok: false; reason: "verify_url_unavailable" };

export function sessionCloudApiUrl(apiBase?: string | null): string {
  const base = (apiBase || process.env.SESSIONCLOUD_API_URL || DEFAULT_SESSIONCLOUD_API_URL).trim();
  return base.replace(/\/+$/, "").replace(/\/parse$/, "");
}

export async function mintConfirmEmailUrl(opts: {
  objectId?: string | null;
  secret?: string | null;
  apiBase?: string | null;
  now?: Date;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<MintResult> {
  const objectId = (opts.objectId || "").trim();
  const secret = (opts.secret || "").trim();
  if (!objectId || !secret) return { ok: false, reason: "verify_url_unavailable" };

  const ts = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const raw = JSON.stringify({ objectId, ts });
  const sig = marketingWebhookSignature(raw, secret);
  const url = `${sessionCloudApiUrl(opts.apiBase)}${CONFIRM_EMAIL_MINT_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? MINT_TIMEOUT_MS);
  try {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": sig,
      },
      body: raw,
      signal: controller.signal,
    });
    if (res.status === 409) return { ok: false, reason: "already_verified" };
    if (!res.ok) return { ok: false, reason: "verify_url_unavailable" };
    const json = (await res.json()) as { url?: unknown; exp?: unknown };
    if (typeof json.url !== "string" || !json.url.trim()) {
      return { ok: false, reason: "verify_url_unavailable" };
    }
    return { ok: true, url: json.url.trim(), exp: Number(json.exp) };
  } catch {
    return { ok: false, reason: "verify_url_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
