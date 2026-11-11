/**
 * Render local HTML previews of the YouTube-thumbnail DRAFT emails (no DB, no send).
 *   npx tsx scripts/render-youtube-previews.ts <outDir>
 * Writes <outDir>/<sequence>-step<N>.html, <outDir>/assets/<slug>.jpg (copied from
 * public/email/youtube) and <outDir>/index.html. Image src in previews is rewritten to
 * the relative assets/ copy so the files open offline; the real email uses our domain.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { YOUTUBE_DRAFT_SEQUENCES } from "../src/lib/trialNurture/copyYoutubeDrafts";
import { YOUTUBE_DRAFT_PLAN } from "../src/lib/trialNurture/copyYoutubeDrafts";
import { YOUTUBE_THUMB_DIR, youtubeThumbUrl } from "../src/lib/trialNurture/youtubeBlocks";
import { render, renderSubject, type Step } from "../src/lib/trialNurture/schedule";
import { renderNurtureHtml, escapeHtml } from "../src/lib/trialNurture/htmlTemplate";

const outDir = resolve(process.argv[2] || "youtube-previews");
mkdirSync(join(outDir, "assets"), { recursive: true });
const PRODUCT: Record<string, string> = { generic_softphone: "generic_softphone", sessionpbx_trial: "teams_phone", hosted_pbx: "hosted_pbx" };
const LABEL: Record<string, string> = { generic_softphone: "Softphone pack (generic_softphone)", sessionpbx_trial: "Teams Phone / Business (sessionpbx_trial)", hosted_pbx: "Hosted PBX (hosted_pbx)" };
const fieldsBase = { sipDomain: "acme.uk.sip.sessiontalk.io", accountName: "acme", trialEndsAt: new Date("2026-11-20T12:00:00Z") };
const rows: string[] = [];

for (const [key, seq] of Object.entries(YOUTUBE_DRAFT_SEQUENCES)) {
  rows.push(`<h2>${escapeHtml(LABEL[key])}</h2><ul>`);
  for (const c of seq) {
    const v = YOUTUBE_DRAFT_PLAN[key as keyof typeof YOUTUBE_DRAFT_PLAN][c.step]!;
    copyFileSync(join("public", YOUTUBE_THUMB_DIR, `${v.slug}.jpg`), join(outDir, "assets", `${v.slug}.jpg`));
    const fields = { ...fieldsBase, product: PRODUCT[key], step: c.step as Step };
    const text = render(c.body, "Sam", fields);
    const subject = renderSubject(c.subject, "Sam", fields);
    let html = renderNurtureHtml({ textBody: text, unsubscribeUrl: "https://marketing.sessiontalk.co.uk/api/unsubscribe?token=preview", subject, htmlBody: render(c.html!, escapeHtml("Sam"), fields) });
    html = html.split(youtubeThumbUrl(v.slug)).join(`assets/${v.slug}.jpg`);
    const name = `${key}-step${c.step}.html`;
    writeFileSync(join(outDir, name), html);
    writeFileSync(join(outDir, `${key}-step${c.step}.txt`), `Subject: ${subject}\n\n${text}\n`);
    rows.push(`<li><a href="${name}">Step ${c.step}: ${escapeHtml(subject)}</a> (<a href="${key}-step${c.step}.txt">text</a>) &middot; video <a href="https://www.youtube.com/watch?v=${v.id}">${v.id}</a> &middot; ${escapeHtml(v.title)}</li>`);
  }
  rows.push("</ul>");
}
writeFileSync(join(outDir, "index.html"), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>YouTube thumbnail drafts: nurture previews</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;color:#1e293b}li{margin:6px 0}code{background:#f1f5f9;padding:1px 4px}</style></head><body>
<h1>YouTube thumbnail drafts: nurture email previews</h1>
<p>DRAFT, not live. All variants are <code>final:false</code> and not in <code>NURTURE_SEQUENCES</code>. Captions are <strong>[HoM copy pending]</strong> placeholders. Sample tenant: Sam / acme.uk.sip.sessiontalk.io. Images point at local <code>assets/</code> copies here; real emails use <code>https://marketing.sessiontalk.co.uk/email/youtube/&lt;slug&gt;.jpg</code>.</p>
${rows.join("\n")}
</body></html>\n`);
console.log(`wrote previews to ${outDir}`);
