/**
 * INTERIM SessionTalk-branded HTML wrapper for trial-nurture emails (draft, 5 Nov 2026).
 * Head of Marketing is building the final branded template; replace `wrapNurtureHtml`
 * (or supply `html` on NurtureCopy) when it lands. Keep this minimal: no invented design.
 *
 * Logo: no stable public HTTPS logo found (https://sessiontalk.co.uk/logo.png -> 308 -> sessiontalk.io/logo.png = 404),
 * so this uses a styled text wordmark. Type per welcome-drip notes: Google Sans if installed, DM Sans webfont.
 */
import { UNFILLED_PLACEHOLDER_RE } from "./links";

export const BRAND_PURPLE = "#5B2D8E"; // interim accent; HoM to confirm logo_purple hex
export const UNSUBSCRIBE_TOKEN = "{{unsubscribe_url}}"; // same token shape the newsletter uses

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
<span style="font-family:${font};font-size:22px;font-weight:700;color:${BRAND_PURPLE};letter-spacing:-0.3px;">SessionTalk</span>
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
 * Build the HTML part. If HoM's copy supplies `htmlBody` (already placeholder-rendered), it is used as inner HTML
 * and `{{unsubscribe_url}}` is substituted; otherwise the rendered plain text is wrapped.
 */
export function renderNurtureHtml(input: { textBody: string; unsubscribeUrl: string; subject?: string; htmlBody?: string }): string {
  if (input.htmlBody) {
    const inner = input.htmlBody.split(UNSUBSCRIBE_TOKEN).join(escapeHtml(input.unsubscribeUrl));
    return /<html[\s>]/i.test(inner) ? inner : wrapNurtureHtml(inner, input);
  }
  return wrapNurtureHtml(textToHtml(input.textBody), input);
}

/** Unfilled {token} in HTML text content (ignores CSS braces inside <style>/attributes by stripping tags+style). */
export function htmlHasUnfilledPlaceholder(html: string): boolean {
  return UNFILLED_PLACEHOLDER_RE.test(htmlToVisibleText(html)) || html.includes(UNSUBSCRIBE_TOKEN);
}

export function htmlToVisibleText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/** hrefs in the HTML, so link-safety checks see the same URLs as the text part. */
export function htmlHrefs(html: string): string {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).join("\n");
}
