/**
 * DRAFT YouTube-thumbnail variants of live nurture emails (11 Nov 2026), per HoM draft
 * /workspace/marketing/drips/youtube-embeds/2026-11-11-DRAFT.md and HoD placements.
 *
 * NOT LIVE: every entry is final:false and none is registered in NURTURE_SEQUENCES / copyFor(),
 * so the worker can neither send nor claim them. Approved copy files are untouched; variants
 * are derived at import time by exact anchored insertions (they throw if an anchor moves).
 * tests/youtubeEmbedsDraft.test.ts pins approved renders by sha256 to master 92437f76.
 *
 * hosted_pbx: intentionally no variants.
 * Needs Nauman's exact-text approval before any of this is folded into approved copy.
 */
import type { NurtureCopy } from "./copy";
import { NURTURE_COPY } from "./copy";
import { GENERIC_SOFTPHONE_COPY } from "./copyHostedGeneric";
import { textToHtml } from "./htmlTemplate";
import { YOUTUBE_VIDEOS, youtubeThumbBlockHtml, youtubeThumbBlockText, type YoutubePlacementCopy } from "./youtubeBlocks";

export type YoutubeDraftSequenceKey = "generic_softphone" | "sessionpbx_trial";

interface Placement extends YoutubePlacementCopy {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  /** Text part: exact substring to replace, and its replacement (block = {BLOCK}). */
  text: { find: string; replace: string };
  /** HTML fragment (softphone only; Teams HTML is built from the text): insert block before this exact substring. */
  htmlBefore?: string;
  optional?: boolean;
}

const BLOCK = "{BLOCK}";
const SOFTPHONE_SIGNOFF_HTML = `<p style="margin:24px 0 0 0;`;

export const YOUTUBE_DRAFT_PLACEMENTS: Record<YoutubeDraftSequenceKey, Placement[]> = {
  // Softphone pack: steps 1, 4, 6 have no video.
  generic_softphone: [
    {
      step: 2,
      video: YOUTUBE_VIDEOS.registrationFailed,
      leadIn: "This short video walks through the usual registration checks:",
      alt: "Video thumbnail: Fix Registration Failed on SessionTalk Softphone Mobile, for iPhone and Android",
      // HoM: text splits the closing paragraph; HTML goes after that paragraph, before the sign-off.
      text: {
        find: "matching your phone system. Reply with what you see and I'll help.\n\n",
        replace: `matching your phone system.\n\n${BLOCK}\n\nReply with what you see and I'll help.\n\n`,
      },
      htmlBefore: SOFTPHONE_SIGNOFF_HTML,
    },
    {
      step: 3,
      video: YOUTUBE_VIDEOS.pbxLogoBranding,
      leadIn: "This short video shows how to put your logo on the softphones your team uses, with no wait for the app stores:",
      alt: "Video thumbnail: Put your logo on your team's softphones, with no app-store wait",
      text: {
        find: "Logo branding and white-label apps: {branding_docs_url}\n\n",
        replace: `Logo branding and white-label apps: {branding_docs_url}\n\n${BLOCK}\n\n`,
      },
      // After the "Logo branding and white-label apps" CTA, before the Useful links block.
      htmlBefore: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px 0;"><tr><td style="padding:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#64748b;">Useful links</td></tr><tr><td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:21px;"><a href="{misc_docs_url}"`,
    },
    {
      step: 5,
      video: YOUTUBE_VIDEOS.noSound,
      leadIn: "If a test call connects but there's no audio, this short video covers the usual checks:",
      alt: "Video thumbnail: No sound on calls? Fix audio on SessionTalk Softphone Mobile, for iPhone and Android",
      text: {
        find: "just reply to this email and I'll pick it up.\n\n",
        replace: `just reply to this email and I'll pick it up.\n\n${BLOCK}\n\n`,
      },
      // After the "if something is stuck" paragraph, before the Useful links list.
      htmlBefore: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px 0;"><tr><td style="padding:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#64748b;">Useful links</td></tr><tr><td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:21px;"><a href="{qr_docs_url}"`,
    },
  ],
  // Teams Phone / Business (SessionPBX trial): steps 3 and 5 have no video.
  sessionpbx_trial: [
    {
      step: 1,
      video: YOUTUBE_VIDEOS.pbxTeamMembers,
      leadIn: "This short video shows how to add team members and extensions:",
      alt: "Video thumbnail: Add team members and extensions in SessionPBX",
      text: {
        find: "team-members/extensions\n\nIf anything looks unclear",
        replace: `team-members/extensions\n\n${BLOCK}\n\nIf anything looks unclear`,
      },
    },
    {
      step: 2,
      video: YOUTUBE_VIDEOS.setupSipAccount,
      leadIn: "This short video shows how to set up SessionTalk Softphone on iPhone or Android with a SIP account:",
      alt: "Video thumbnail: How to set up SessionTalk Softphone Mobile with your SIP account, for iPhone and Android",
      text: {
        find: "team-members/install-apps\n\nOnce you hear it ring",
        replace: `team-members/install-apps\n\n${BLOCK}\n\nOnce you hear it ring`,
      },
    },
    {
      // OPTIONAL (HoM open question 4: explainer here, or no video in this check-in).
      step: 4,
      optional: true,
      video: YOUTUBE_VIDEOS.pbxExplainer,
      leadIn: "If a short overview would help, this video explains how SessionPBX works:",
      alt: "Video thumbnail: Hosted Phone System for Small Businesses, Explained, SessionPBX",
      text: {
        find: "so I wanted to see how it's going.\n\nIf anything's unclear",
        replace: `so I wanted to see how it's going.\n\n${BLOCK}\n\nIf anything's unclear`,
      },
    },
  ],
};

const SOURCE: Record<YoutubeDraftSequenceKey, NurtureCopy[]> = {
  generic_softphone: GENERIC_SOFTPHONE_COPY,
  sessionpbx_trial: NURTURE_COPY,
};

function replaceExactlyOnce(s: string, find: string, replace: string, what: string): string {
  const i = s.indexOf(find);
  if (i < 0 || s.indexOf(find, i + 1) >= 0) throw new Error(`youtube draft: anchor not found exactly once (${what})`);
  return s.slice(0, i) + replace + s.slice(i + find.length);
}

function draftFor(key: YoutubeDraftSequenceKey): NurtureCopy[] {
  return YOUTUBE_DRAFT_PLACEMENTS[key].map((p) => {
    const c = SOURCE[key].find((x) => x.step === p.step);
    if (!c) throw new Error(`youtube draft: no ${key} step ${p.step}`);
    const what = `${key} step ${p.step}`;
    const body = replaceExactlyOnce(c.body, p.text.find, p.text.replace.split(BLOCK).join(youtubeThumbBlockText(p)), what);
    let html: string;
    if (c.html) {
      if (!p.htmlBefore) throw new Error(`youtube draft: html anchor missing (${what})`);
      const anchor = p.htmlBefore;
      const i = anchor === SOFTPHONE_SIGNOFF_HTML ? c.html.lastIndexOf(anchor) : c.html.indexOf(anchor);
      if (i < 0) throw new Error(`youtube draft: html anchor not found (${what})`);
      html = c.html.slice(0, i) + youtubeThumbBlockHtml(p) + "\n" + c.html.slice(i);
    } else {
      // Text-only approved copy: same fragment the live path builds (textToHtml), block at the text insertion point.
      const [before, after] = p.text.replace.split(BLOCK);
      const i = c.body.indexOf(p.text.find);
      const head = c.body.slice(0, i) + before;
      const tail = after + c.body.slice(i + p.text.find.length);
      html = `${textToHtml(head)}\n${youtubeThumbBlockHtml(p)}\n${textToHtml(tail)}`;
    }
    return { ...c, file: `${c.file}#youtube-draft`, body, html, final: false };
  });
}

/** Draft-only variants (revised steps only). Never add these to NURTURE_SEQUENCES. */
export const YOUTUBE_DRAFT_SEQUENCES: Record<YoutubeDraftSequenceKey, NurtureCopy[]> = {
  generic_softphone: draftFor("generic_softphone"),
  sessionpbx_trial: draftFor("sessionpbx_trial"),
};
