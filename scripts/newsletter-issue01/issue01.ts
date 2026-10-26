/**
 * Newsletter issue #1 shared config + preflight for the seed and broadcast scripts.
 * Templates (approved copy) are NOT committed (public repo): copy the 6 *.template.{html,txt}
 * next to this file at run time (see README).
 */
import fs from "fs";
import path from "path";

export const CAMPAIGN = "newsletter-2026-10";
export const DIR = __dirname;
export const IMG_BASE = "https://sessiontalk.io/img/newsletter/2026-10/";
export const IMAGES = ["sessiontalk-logo.png", "hero-dark-sessioncloud-play.png", "light-vs-dark-appstore.png"];
export const VERSIONS = [
  { key: "A1", file: "issue-01-A1-customers", subject: "Dark mode is here, plus a few other new things" },
  { key: "A2alt", file: "issue-01-A2alt-signups", subject: "Dark mode is here, plus a few other new things" },
  { key: "B", file: "issue-01-B-winback", subject: "Dark mode is here, plus a few other new things" },
] as const;
export type VariantKey = (typeof VERSIONS)[number]["key"];
export const BANNED = /3CX|Yeastar|VitalPBX|Vodia|SessionPBX|private label|PENDING/i;

export interface Template { key: VariantKey; file: string; subject: string; html: string; text: string }

export function readTemplates(keys: readonly VariantKey[] = VERSIONS.map((v) => v.key)): Template[] {
  return VERSIONS.filter((v) => keys.includes(v.key)).map((v) => {
    const read = (ext: string) => fs.readFileSync(path.join(DIR, `${v.file}.template.${ext}`), "utf8");
    return { ...v, html: read("html"), text: read("txt") };
  });
}

/** Offline checks (no DB, no SES): templates present, no banned terms, placeholders, images 200 (HEAD). */
export async function templatePreflight(keys: readonly VariantKey[] = VERSIONS.map((v) => v.key)): Promise<string[]> {
  const fail: string[] = [];
  for (const v of VERSIONS.filter((x) => keys.includes(x.key))) for (const ext of ["html", "txt"]) {
    const p = path.join(DIR, `${v.file}.template.${ext}`);
    if (!fs.existsSync(p)) { fail.push(`missing template ${path.basename(p)} (copy it next to this script)`); continue; }
    const s = fs.readFileSync(p, "utf8");
    if (BANNED.test(s)) fail.push(`banned term in ${path.basename(p)}`);
    if (!s.includes("{{unsubscribe_url}}")) fail.push(`no {{unsubscribe_url}} in ${path.basename(p)}`);
  }
  for (const f of IMAGES) {
    try {
      const r = await fetch(IMG_BASE + f, { method: "HEAD" });
      if (r.status !== 200) fail.push(`image ${f} -> HTTP ${r.status}`);
    } catch (e: any) { fail.push(`image ${f} -> ${e?.name || "error"}`); }
  }
  return fail;
}

/** Lower-cased addresses from an SES suppression CSV export (any column). */
export function readSuppressionCsv(file: string): Set<string> {
  return new Set(fs.readFileSync(file, "utf8").toLowerCase().split(/[\s,;"]+/).filter((x) => x.includes("@")));
}
