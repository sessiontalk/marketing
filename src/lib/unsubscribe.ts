/**
 * Unsubscribe helpers: List-Unsubscribe headers (RFC 2369 + RFC 8058 one-click) and the
 * /api/unsubscribe handler logic. Pure / store-injected so it is unit-testable without a DB.
 */

/** Tokens are 32 random bytes as hex (see tokens.ts). Anything else is rejected before any DB access. */
export const UNSUBSCRIBE_TOKEN_RE = /^[a-f0-9]{64}$/;

/** Production CRM host (Vercel). Used when NEXT_PUBLIC_APP_URL is unset or not https. */
export const DEFAULT_PUBLIC_BASE_URL = "https://marketing.sessiontalk.co.uk";

export function isValidUnsubscribeToken(token: unknown): token is string {
  return typeof token === "string" && UNSUBSCRIBE_TOKEN_RE.test(token);
}

/** https base URL for links that go out in email. Never localhost / http. */
export function publicBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const v = (env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v) ? v : DEFAULT_PUBLIC_BASE_URL;
}

export function publicUnsubscribeUrl(token: string, env: Record<string, string | undefined> = process.env): string {
  return `${publicBaseUrl(env)}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * List-Unsubscribe (https one-click URL + mailto fallback) and List-Unsubscribe-Post.
 * The https URL must accept a POST with body "List-Unsubscribe=One-Click" (RFC 8058).
 */
export function listUnsubscribeHeaders(url: string, mailto: string): Record<string, string> {
  if (!/^https:\/\/[^\s<>,]+$/i.test(url)) throw new Error("List-Unsubscribe URL must be https");
  if (!/^[^\s@<>,?]+@[^\s@<>,?]+$/.test(mailto)) throw new Error("invalid List-Unsubscribe mailto");
  return {
    "List-Unsubscribe": `<${url}>, <mailto:${mailto}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export interface UnsubscribeStore {
  /** Read-only: does this token exist? */
  tokenExists(token: string): Promise<boolean>;
  /** Mark the token's contact unsubscribed (and cancel enrollments). Returns false if the token is unknown. */
  unsubscribe(token: string): Promise<boolean>;
}

export interface UnsubscribeResult { status: number; html: string }

function page(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
  <body style="font-family: sans-serif; text-align: center; padding: 50px;">
    ${inner}
  </body>
</html>`;
}

export function confirmPageHtml(token: string): string {
  // token is validated hex, so safe to embed; encode anyway.
  const action = `/api/unsubscribe?token=${encodeURIComponent(token)}`;
  return page("Unsubscribe", `<h1>Unsubscribe from SessionTalk emails?</h1>
    <p>Click the button below to stop receiving these emails.</p>
    <form method="POST" action="${action}">
      <input type="hidden" name="token" value="${encodeURIComponent(token)}">
      <button type="submit" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Unsubscribe</button>
    </form>`);
}

export function donePageHtml(): string {
  return page("Unsubscribed", `<h1>You've been unsubscribed</h1>
    <p>You will no longer receive emails from SessionTalk.</p>
    <p><a href="https://sessiontalk.co.uk">Return to SessionTalk</a></p>`);
}

export function invalidPageHtml(): string {
  return page("Invalid link", `<h1>This unsubscribe link is invalid or has expired</h1>
    <p>Reply to the email you received and we'll remove you.</p>`);
}

/**
 * GET never changes state (link scanners / prefetchers follow GETs): it only shows a confirm page.
 * POST (the confirm button, or an RFC 8058 one-click POST from the mailbox provider) unsubscribes.
 */
export async function handleUnsubscribe(
  method: "GET" | "POST",
  token: string | null | undefined,
  store: UnsubscribeStore
): Promise<UnsubscribeResult> {
  if (!token) return { status: 400, html: invalidPageHtml() };
  if (!isValidUnsubscribeToken(token)) return { status: 404, html: invalidPageHtml() };
  if (method === "GET") {
    return (await store.tokenExists(token))
      ? { status: 200, html: confirmPageHtml(token) }
      : { status: 404, html: invalidPageHtml() };
  }
  return (await store.unsubscribe(token))
    ? { status: 200, html: donePageHtml() }
    : { status: 404, html: invalidPageHtml() };
}
