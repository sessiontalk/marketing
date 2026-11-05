/**
 * INTERIM SessionTalk-branded HTML wrapper for trial-nurture emails (draft, 5 Nov 2026).
 * Head of Marketing is building the final branded template; replace `wrapNurtureHtml`
 * (or supply `html` on NurtureCopy) when it lands. Keep this minimal: no invented design.
 *
 * Logo: https://sessiontalk.io/logo_purple.png (HoM confirmed; HEAD 200 on 5 Nov 2026). Text wordmark kept as alt text.
 * Type per welcome-drip notes: Google Sans if installed, DM Sans webfont.
 *
 * HoM SWAP POINT: HoM delivers a shared shell (marketing/drips/html/shell.html) containing {{body_html}} and
 * {{unsubscribe_url}} (optionally {{body_text}} for reference). Copy it into src/lib/trialNurture/shell.html.ts
 * as `export const NURTURE_SHELL_HTML = `...``, then set DEFAULT_SHELL_HTML below to it. No runtime read of /workspace.
 */
import { UNFILLED_PLACEHOLDER_RE } from "./links";
import { NURTURE_SHELL_HTML } from "./shell.html";

export const BRAND_PURPLE = "#5B2D8E"; // interim accent; HoM to confirm logo_purple hex
export const UNSUBSCRIBE_TOKEN = "{{unsubscribe_url}}"; // same token shape the newsletter uses
export const BODY_HTML_TOKEN = "{{body_html}}";
export const BODY_TEXT_TOKEN = "{{body_text}}";
export const LOGO_URL = "https://sessiontalk.io/logo_purple.png";

/** HoM shell string once delivered (null = interim wrapper). */
export const DEFAULT_SHELL_HTML: string | null = NURTURE_SHELL_HTML; // HoM shell wired 5 Nov 2026

export function isShell(html: string | null | undefined): html is string {
  return !!html && html.includes(BODY_HTML_TOKEN);
}

/** Substitute HoM shell tokens. bodyHtml must be trusted/pre-escaped; unsubscribe + body_text are escaped here. */
export function applyShell(shellHtml: string, p: { bodyHtml: string; unsubscribeUrl: string; textBody?: string; subject?: string }): string {
  return shellHtml
    .split(BODY_HTML_TOKEN).join(p.bodyHtml)
    .split(UNSUBSCRIBE_TOKEN).join(escapeHtml(p.unsubscribeUrl))
    .split(BODY_TEXT_TOKEN).join(escapeHtml(p.textBody ?? ""))
    .split("{{subject}}").join(escapeHtml(p.subject ?? "SessionTalk"));
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const URL_RE = /https:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;

/** Escaped plain text -> <p> paragraphs (blank-line separated), single newlines -> <br>, https URLs autolinked. */
export function textToHtml(text: string): string {
  return text.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/).map((para) => {
    const esc = escapeHtml(para).replace(URL_RE, (u) => `<a href="${u}" style="color:${BRAND_PURPLE};">${u}</a>`);
    return `<p style="margin:0 0 16px 0;">${esc.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
}

/** Seam for HoM's template: wraps already-safe inner HTML. innerHtml MUST be pre-escaped/trusted. */
export function wrapNurtureHtml(innerHtml: string, opts: { unsubscribeUrl: string; subject?: string }): string {
  const unsub = escapeHtml(opts.unsubscribeUrl);
  const title = escapeHtml(opts.subject ?? "SessionTalk");
  const font = "'Google Sans','DM Sans',Arial,Helvetica,sans-serif";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f6f6f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f9;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;font-family:${font};color:#1a1a1a;font-size:15px;line-height:1.6;">
<tr><td style="padding:24px 32px;border-bottom:3px solid ${BRAND_PURPLE};">
<img src="${LOGO_URL}" alt="SessionTalk" height="32" style="display:block;height:32px;width:auto;border:0;font-family:${font};font-size:22px;font-weight:700;color:${BRAND_PURPLE};">
</td></tr>
<tr><td style="padding:28px 32px 12px 32px;">
${innerHtml}
</td></tr>
<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
SessionTalk &middot; Softphone and cloud PBX for VoIP providers<br>
You're receiving this because you started a SessionTalk trial. <a href="${unsub}" style="color:#6b7280;">Unsubscribe</a>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

/**
 * Build the HTML part (SES multipart; text part stays authoritative).
 * - htmlBody full document (<html>): used as-is, {{unsubscribe_url}} substituted.
 * - htmlBody fragment or none: body = htmlBody ?? textToHtml(textBody); then
 *   shellHtml (or DEFAULT_SHELL_HTML) if it contains {{body_html}} -> applyShell; else interim wrapNurtureHtml.
 */
export function renderNurtureHtml(input: { textBody: string; unsubscribeUrl: string; subject?: string; htmlBody?: string; shellHtml?: string | null }): string {
  const unsub = escapeHtml(input.unsubscribeUrl);
  if (input.htmlBody && /<html[\s>]/i.test(input.htmlBody)) return input.htmlBody.split(UNSUBSCRIBE_TOKEN).join(unsub);
  const body = (input.htmlBody ? input.htmlBody.split(UNSUBSCRIBE_TOKEN).join(unsub) : textToHtml(input.textBody));
  const shell = input.shellHtml ?? DEFAULT_SHELL_HTML;
  if (isShell(shell)) return applyShell(shell, { bodyHtml: body, unsubscribeUrl: input.unsubscribeUrl, textBody: input.textBody, subject: input.subject });
  return wrapNurtureHtml(body, input);
}

/** Unfilled {token} in HTML text content (ignores CSS braces inside <style>/attributes by stripping tags+style). */
export function htmlHasUnfilledPlaceholder(html: string): boolean {
  return UNFILLED_PLACEHOLDER_RE.test(htmlToVisibleText(html)) || html.includes(UNSUBSCRIBE_TOKEN) || html.includes(BODY_HTML_TOKEN) || html.includes(BODY_TEXT_TOKEN);
}

export function htmlToVisibleText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/** hrefs in the HTML, so link-safety checks see the same URLs as the text part. */
export function htmlHrefs(html: string): string {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).join("\n");
}
