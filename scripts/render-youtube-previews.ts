/**
 * Render local HTML previews of the YouTube-thumbnail DRAFT emails (no DB, no send).
 *   npx tsx scripts/render-youtube-previews.ts <outDir> <thumbsDir>
 * <thumbsDir> holds <slug>.jpg (the files from sessiontalk-website #31). Writes
 * <outDir>/<sequence>-step<N>.html + .txt, <outDir>/assets/<slug>.jpg and index.html.
 * Image src is rewritten to the relative assets/ copy so previews open offline; real
 * emails use https://sessiontalk.io/email/youtube/<slug>.jpg (pending website deploy).
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { YOUTUBE_DRAFT_SEQUENCES, YOUTUBE_DRAFT_PLACEMENTS } from "../src/lib/trialNurture/copyYoutubeDrafts";
import { youtubeThumbUrl } from "../src/lib/trialNurture/youtubeBlocks";
import { render, renderSubject, type Step } from "../src/lib/trialNurture/schedule";
import { renderNurtureHtml, escapeHtml } from "../src/lib/trialNurture/htmlTemplate";

const outDir = resolve(process.argv[2] || "youtube-previews");
const thumbsDir = resolve(process.argv[3] || "thumbs");
mkdirSync(join(outDir, "assets"), { recursive: true });
const PRODUCT: Record<string, string> = { generic_softphone: "generic_softphone", sessionpbx_trial: "teams_phone" };
const LABEL: Record<string, string> = { generic_softphone: "Softphone pack (generic_softphone)", sessionpbx_trial: "Teams Phone / Business (sessionpbx_trial)" };
const fieldsBase = { sipDomain: "acme.uk.sip.sessiontalk.io", accountName: "acme", trialEndsAt: new Date("2026-11-20T12:00:00Z") };
const rows: string[] = [];

for (const [key, seq] of Object.entries(YOUTUBE_DRAFT_SEQUENCES)) {
  rows.push(`<h2>${escapeHtml(LABEL[key])}</h2><ul>`);
  for (const c of seq) {
    const p = YOUTUBE_DRAFT_PLACEMENTS[key as keyof typeof YOUTUBE_DRAFT_PLACEMENTS].find((x) => x.step === c.step)!;
    const v = p.video;
    copyFileSync(join(thumbsDir, `${v.slug}.jpg`), join(outDir, "assets", `${v.slug}.jpg`));
    const fields = { ...fieldsBase, product: PRODUCT[key], step: c.step as Step };
    const text = render(c.body, "Sam", fields);
    const subject = renderSubject(c.subject, "Sam", fields);
    let html = renderNurtureHtml({ textBody: text, unsubscribeUrl: "https://marketing.sessiontalk.co.uk/api/unsubscribe?token=preview", subject, htmlBody: render(c.html!, escapeHtml("Sam"), fields) });
    html = html.split(youtubeThumbUrl(v.slug)).join(`assets/${v.slug}.jpg`);
    const name = `${key}-step${c.step}`;
    writeFileSync(join(outDir, `${name}.html`), html);
    writeFileSync(join(outDir, `${name}.txt`), `Subject: ${subject}\n\n${text}\n`);
    rows.push(`<li><a href="${name}.html">Step ${c.step}: ${escapeHtml(subject)}</a> (<a href="${name}.txt">text</a>) &middot; <a href="https://www.youtube.com/watch?v=${v.id}">${v.id}</a> ${escapeHtml(v.title)}${p.optional ? " <strong>(optional)</strong>" : ""}</li>`);
  }
  rows.push("</ul>");
}
writeFileSync(join(outDir, "index.html"), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>YouTube thumbnail drafts: nurture previews</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;color:#1e293b}li{margin:6px 0}code{background:#f1f5f9;padding:1px 4px}</style></head><body>
<h1>YouTube thumbnail drafts: nurture email previews</h1>
<p>DRAFT, not live. Wording and placement are from HoM's 2026-11-11-DRAFT.md, which still needs Nauman's exact-text approval. All variants are <code>final:false</code> and none is in <code>NURTURE_SEQUENCES</code>. hosted_pbx has no changes.</p>
<p>Sample tenant: Sam / acme.uk.sip.sessiontalk.io. Images here are local <code>assets/</code> copies. Real emails use <code>https://sessiontalk.io/email/youtube/&lt;slug&gt;.jpg</code>, which only works once sessiontalk-website #31 is deployed.</p>
${rows.join("\n")}
</body></html>\n`);
console.log(`wrote previews to ${outDir}`);
