/**
 * Email-safe linked YouTube thumbnail blocks for nurture HTML (DRAFT, 11 Nov 2026).
 *
 * - Table layout, <img> with explicit width/height + alt, no CSS background-image.
 * - The play icon is baked into each JPEG (public/email/youtube/<slug>.jpg, 600x338),
 *   so it shows in every client, including Outlook with images on.
 * - Thumbnails are served from our own domain (publicBaseUrl()), never i.ytimg.com.
 * - Caption copy is a clearly marked placeholder until HoM supplies wording.
 *
 * Only used by copyYoutubeDrafts.ts (final:false, not in NURTURE_SEQUENCES).
 */
import { escapeHtml } from "./htmlTemplate";
import { publicBaseUrl } from "../unsubscribe";

export const HOM_COPY_PENDING = "[HoM copy pending]";
export const YOUTUBE_THUMB_DIR = "/email/youtube";
/** Display size in the 520px content column of the HoM shell (file is 600x338). */
export const YOUTUBE_THUMB_WIDTH = 520;
export const YOUTUBE_THUMB_HEIGHT = 293;

export interface YoutubeVideo {
  slug: string;
  id: string;
  /** Public YouTube title (oEmbed, 11 Nov 2026). Used for alt text. */
  title: string;
}

export const YOUTUBE_VIDEOS = {
  setupSipAccount: { slug: "01-setup-sip-account", id: "aKed7YABD2o", title: "How to Set Up SessionTalk Softphone Mobile with Your SIP Account (iPhone & Android)" },
  transferCall: { slug: "02-transfer-call", id: "dUSjWkHxnuY", title: "How to Transfer a Call (Blind & Warm) on SessionTalk Softphone Mobile (iPhone & Android)" },
  registrationFailed: { slug: "03-registration-failed", id: "Sk6e5jRMb84", title: "Fix \"Registration Failed\" on SessionTalk Softphone Mobile (iPhone & Android)" },
  forwardCall: { slug: "04-forward-call", id: "MPF0a924UWw", title: "How to Forward a Call Before Answering on SessionTalk Softphone Mobile (iPhone & Android)" },
  missedCalls: { slug: "05-missed-calls", id: "k5Bbq2lIJyU", title: "How to Find a Missed Call and Call Back on SessionTalk Softphone Mobile (iPhone & Android)" },
  favourites: { slug: "06-favourites", id: "S4YjW8pPHYo", title: "How to Save Favourite Contacts on SessionTalk Softphone Mobile (iPhone & Android)" },
  noSound: { slug: "07-no-sound", id: "RMv-JA7RH7o", title: "No Sound on Calls? Fix Audio on SessionTalk Softphone Mobile (iPhone & Android)" },
  pbxExplainer: { slug: "sessionpbx-explainer", id: "wVg9-Tdf03E", title: "Hosted Phone System for Small Businesses, Explained | SessionPBX" },
  pbxTeamMembers: { slug: "sessionpbx-team-members", id: "7ftMf6ZNwo0", title: "Add team members and extensions in SessionPBX" },
  pbxLogoBranding: { slug: "sessionpbx-logo-branding", id: "i0pPhOZJwE4", title: "Put your logo on your team's softphones, with no app-store wait" },
} as const satisfies Record<string, YoutubeVideo>;

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const SLUG_RE = /^[a-z0-9-]+$/;

export function youtubeWatchUrl(id: string): string {
  if (!VIDEO_ID_RE.test(id)) throw new Error(`invalid YouTube id: ${id}`);
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeThumbUrl(slug: string, baseUrl: string = publicBaseUrl()): string {
  if (!SLUG_RE.test(slug)) throw new Error(`invalid thumbnail slug: ${slug}`);
  return `${baseUrl}${YOUTUBE_THUMB_DIR}/${slug}.jpg`;
}

export function youtubeCaption(v: YoutubeVideo): string {
  return `${HOM_COPY_PENDING} Watch the video: ${v.title}`;
}

/** Linked thumbnail + caption link. Table-based; safe for Outlook/Gmail/Apple Mail. */
export function youtubeThumbBlockHtml(v: YoutubeVideo, opts: { caption?: string; baseUrl?: string } = {}): string {
  const href = escapeHtml(youtubeWatchUrl(v.id));
  const src = escapeHtml(youtubeThumbUrl(v.slug, opts.baseUrl));
  const alt = escapeHtml(`Play video: ${v.title}`);
  const caption = escapeHtml(opts.caption ?? youtubeCaption(v));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 20px 0;">` +
    `<tr><td align="center" style="padding:0;">` +
    `<a href="${href}" target="_blank" style="display:block;text-decoration:none;border:0;">` +
    `<img src="${src}" width="${YOUTUBE_THUMB_WIDTH}" height="${YOUTUBE_THUMB_HEIGHT}" alt="${alt}" style="display:block;width:100%;max-width:${YOUTUBE_THUMB_WIDTH}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#1e293b;">` +
    `</a></td></tr>` +
    `<tr><td align="left" style="padding:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#1e293b;">` +
    `<a href="${href}" target="_blank" style="color:#00A2E9;text-decoration:underline;">&#9654;&nbsp;${caption}</a>` +
    `</td></tr></table>`;
}

/** Plain-text part equivalent (text stays authoritative for SES multipart). */
export function youtubeThumbBlockText(v: YoutubeVideo, caption?: string): string {
  return `${caption ?? youtubeCaption(v)}\n${youtubeWatchUrl(v.id)}`;
}
