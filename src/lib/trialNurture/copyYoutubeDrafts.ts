/**
 * DRAFT YouTube-thumbnail variants of the softphone pack and Teams/PBX nurture steps (11 Nov 2026).
 *
 * NOT LIVE: every entry is final:false and none of these arrays is registered in
 * NURTURE_SEQUENCES / copyFor(), so the worker can neither send nor hold-claim them.
 * Approved copy (copy.ts, copyHostedGeneric.ts, ...) is untouched; the variants are
 * derived from it at import time. tests/youtubeEmbedsDraft.test.ts proves approved
 * renders are byte-identical to master 92437f76.
 *
 * Captions are "[HoM copy pending]" placeholders. To go live: HoM wording + Nauman
 * exact-text approval, then fold the chosen blocks into the approved copy and flip final.
 */
import type { NurtureCopy } from "./copy";
import { NURTURE_COPY } from "./copy";
import { GENERIC_SOFTPHONE_COPY, HOSTED_PBX_COPY } from "./copyHostedGeneric";
import { textToHtml } from "./htmlTemplate";
import { YOUTUBE_VIDEOS, youtubeThumbBlockHtml, youtubeThumbBlockText, type YoutubeVideo } from "./youtubeBlocks";

export type YoutubeDraftSequenceKey = "generic_softphone" | "sessionpbx_trial" | "hosted_pbx";

/** Which video goes in which step (one block per step, before the sign-off). */
export const YOUTUBE_DRAFT_PLAN: Record<YoutubeDraftSequenceKey, Partial<Record<1 | 2 | 3 | 4 | 5 | 6, YoutubeVideo>>> = {
  // Softphone pack (generic + white-label softphone trials). Steps 4 (messaging) and 6 (trial ending) unchanged.
  generic_softphone: {
    1: YOUTUBE_VIDEOS.setupSipAccount,
    2: YOUTUBE_VIDEOS.registrationFailed,
    3: YOUTUBE_VIDEOS.noSound,
    5: YOUTUBE_VIDEOS.transferCall,
  },
  // Teams Phone / Teams Business (SessionPBX trial). Step 5 (trial ending) unchanged.
  sessionpbx_trial: {
    1: YOUTUBE_VIDEOS.pbxTeamMembers,
    2: YOUTUBE_VIDEOS.noSound,
    3: YOUTUBE_VIDEOS.pbxExplainer,
    4: YOUTUBE_VIDEOS.pbxLogoBranding,
  },
  // Hosted PBX (already final:false upstream). Step 5 (trial ending) unchanged.
  hosted_pbx: {
    1: YOUTUBE_VIDEOS.pbxTeamMembers,
    2: YOUTUBE_VIDEOS.noSound,
    3: YOUTUBE_VIDEOS.pbxExplainer,
    4: YOUTUBE_VIDEOS.pbxLogoBranding,
  },
};

const SOURCE: Record<YoutubeDraftSequenceKey, NurtureCopy[]> = {
  generic_softphone: GENERIC_SOFTPHONE_COPY,
  sessionpbx_trial: NURTURE_COPY,
  hosted_pbx: HOSTED_PBX_COPY,
};

const TEXT_SIGNOFF = "\n\nMaryam";

function insertBeforeLast(haystack: string, needle: string, insert: string, what: string): string {
  const i = haystack.lastIndexOf(needle);
  if (i < 0) throw new Error(`youtube draft: sign-off not found (${what})`);
  return haystack.slice(0, i) + insert + haystack.slice(i);
}

/** Insert the text block before the sign-off ("\n\nMaryam ..."). */
export function withYoutubeText(body: string, v: YoutubeVideo): string {
  return insertBeforeLast(body, TEXT_SIGNOFF, `\n\n${youtubeThumbBlockText(v)}`, "text");
}

/** Insert the HTML block before the final paragraph (the sign-off) of an HTML fragment. */
export function withYoutubeHtml(html: string, v: YoutubeVideo): string {
  return insertBeforeLast(html, "<p ", `${youtubeThumbBlockHtml(v)}\n`, "html");
}

function draftFor(key: YoutubeDraftSequenceKey): NurtureCopy[] {
  const plan = YOUTUBE_DRAFT_PLAN[key];
  return SOURCE[key].flatMap((c) => {
    const v = plan[c.step];
    if (!v) return [];
    // Text-only copy (Teams / hosted): build the fragment the live path would make, then add the block.
    const baseHtml = c.html ?? textToHtml(c.body);
    return [{
      ...c,
      file: `${c.file}#youtube-draft`,
      body: withYoutubeText(c.body, v),
      html: withYoutubeHtml(baseHtml, v),
      final: false,
    }];
  });
}

/** Draft-only variants (revised steps only). Never add these to NURTURE_SEQUENCES. */
export const YOUTUBE_DRAFT_SEQUENCES: Record<YoutubeDraftSequenceKey, NurtureCopy[]> = {
  generic_softphone: draftFor("generic_softphone"),
  sessionpbx_trial: draftFor("sessionpbx_trial"),
  hosted_pbx: draftFor("hosted_pbx"),
};
