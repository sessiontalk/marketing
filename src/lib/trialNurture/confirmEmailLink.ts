/**
 * Shared contract with sessioncloudlive server/src/services/confirmEmail.ts.
 * Marketing mints {{verify_url}} at send time. SessionCloud holds WEBHOOK_SECRET
 * and verifies the HMAC; the CRM never stores or embeds a raw verify token.
 *
 * URL: {origin}/parse/confirm-email?uid={objectId}&exp={unixSeconds}&sig={hmacHex}
 * MAC: hex(HMAC-SHA256(WEBHOOK_SECRET, "confirm-email:{objectId}:{exp}"))
 * TTL: 7 days from send. POST on the SessionCloud page issues a fresh confirmation
 * (never reuses the original signup token, works if that token has expired).
 */
import { createHmac } from "node:crypto";

export const CONFIRM_EMAIL_PATH = "/parse/confirm-email";
export const CONFIRM_EMAIL_TTL_SECONDS = 7 * 24 * 60 * 60;
export const DEFAULT_SESSIONCLOUD_ORIGIN = "https://cloud.sessiontalk.io";

export function confirmEmailMac(userId: string, exp: number, secret: string): string {
  return createHmac("sha256", secret).update(`confirm-email:${userId}:${exp}`).digest("hex");
}

export function confirmEmailUrl(origin: string, userId: string, exp: number, secret: string): string {
  const base = origin.replace(/\/$/, "");
  const sig = confirmEmailMac(userId, exp, secret);
  const q = new URLSearchParams({ uid: userId, exp: String(exp), sig });
  return `${base}${CONFIRM_EMAIL_PATH}?${q.toString()}`;
}

/**
 * Build {{verify_url}} at send time. Returns null if objectId or WEBHOOK_SECRET is
 * missing — the worker must hold rather than render a literal {{verify_url}}.
 */
export function buildVerifyUrl(opts: {
  objectId?: string | null;
  secret?: string | null;
  origin?: string | null;
  now?: Date;
}): string | null {
  const uid = (opts.objectId || "").trim();
  const secret = (opts.secret || "").trim();
  if (!uid || !secret) return null;
  const origin = (opts.origin || "").trim() || DEFAULT_SESSIONCLOUD_ORIGIN;
  const exp = Math.floor((opts.now ?? new Date()).getTime() / 1000) + CONFIRM_EMAIL_TTL_SECONDS;
  return confirmEmailUrl(origin, uid, exp, secret);
}
