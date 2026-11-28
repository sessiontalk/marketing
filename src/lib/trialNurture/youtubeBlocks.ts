/**
 * Email-safe linked YouTube thumbnail blocks for nurture HTML (DRAFT, 11 Nov 2026).
 * Pattern and wording: HoM draft /workspace/marketing/drips/youtube-embeds/2026-11-11-DRAFT.md
 * ("Linked-thumbnail pattern"), with two HoD changes:
 *   - img src is our own host, never i.ytimg.com;
 *   - the HTML caption uses the same "Watch: <title>" line as the text part.
 *
 * - Table layout; <img> with explicit width/height + alt; no CSS background-image.
 * - Play icon is baked into each JPEG (600x338).
 *
 * THUMBNAIL HOST PENDING: files are added by sessiontalk/sessiontalk-website draft PR #31
 * (public/email/youtube/<slug>.jpg). Until that is deployed these URLs 404.
 *
 * Only used by copyYoutubeDrafts.ts (final:false, not in NURTURE_SEQUENCES).
 */
import { escapeHtml } from "./htmlTemplate";

/** Pending: served once sessiontalk-website #31 is deployed. */
export const YOUTUBE_THUMB_BASE_URL = "https://sessiontalk.io/email/youtube";
/** HoM pattern width 480; height keeps the 16:9 JPEG ratio. */
export const YOUTUBE_THUMB_WIDTH = 480;
export const YOUTUBE_THUMB_HEIGHT = 270;

export interface YoutubeVideo {
  slug: string;
  id: string;
  /** Official YouTube title (oEmbed, 11 Nov 2026), as quoted in HoM's draft. */
  title: string;
}

export const YOUTUBE_VIDEOS = {
  setupSipAccount: { slug: "01-setup-sip-account", id: "aKed7YABD2o", title: "How to Set Up SessionTalk Softphone Mobile with Your SIP Account (iPhone & Android)" },
  registrationFailed: { slug: "03-registration-failed", id: "Sk6e5jRMb84", title: "Fix \"Registration Failed\" on SessionTalk Softphone Mobile (iPhone & Android)" },
  noSound: { slug: "07-no-sound", id: "RMv-JA7RH7o", title: "No Sound on Calls? Fix Audio on SessionTalk Softphone Mobile (iPhone & Android)" },
  pbxExplainer: { slug: "sessionpbx-explainer", id: "wVg9-Tdf03E", title: "Hosted Phone System for Small Businesses, Explained | SessionPBX" },
  pbxTeamMembers: { slug: "sessionpbx-team-members", id: "7ftMf6ZNwo0", title: "Add team members and extensions in SessionPBX" },
  pbxLogoBranding: { slug: "sessionpbx-logo-branding", id: "i0pPhOZJwE4", title: "Put your logo on your team's softphones, with no app-store wait" },
} as const satisfies Record<string, YoutubeVideo>;

/** HoM's per-email wording (lead-in + alt text), verbatim. */
export interface YoutubePlacementCopy { video: YoutubeVideo; leadIn: string; alt: string }

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const SLUG_RE = /^[a-z0-9-]+$/;

export function youtubeWatchUrl(id: string): string {
  if (!VIDEO_ID_RE.test(id)) throw new Error(`invalid YouTube id: ${id}`);
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeThumbUrl(slug: string): string {
  if (!SLUG_RE.test(slug)) throw new Error(`invalid thumbnail slug: ${slug}`);
  return `${YOUTUBE_THUMB_BASE_URL}/${slug}.jpg`;
}

export function youtubeCaption(v: YoutubeVideo): string {
  return `Watch: ${v.title}`;
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";

/** HoM linked-thumbnail pattern: lead-in paragraph, then linked image + caption link. */
export function youtubeThumbBlockHtml(p: YoutubePlacementCopy): string {
  const href = escapeHtml(youtubeWatchUrl(p.video.id));
  return `<p style="margin:0 0 12px 0;${FONT}font-size:16px;line-height:24px;color:#1e293b;">${escapeHtml(p.leadIn)}</p>\n` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;"><tr><td>` +
    `<a href="${href}" target="_blank" style="display:block;text-decoration:none;">` +
    `<img src="${escapeHtml(youtubeThumbUrl(p.video.slug))}" width="${YOUTUBE_THUMB_WIDTH}" height="${YOUTUBE_THUMB_HEIGHT}" alt="${escapeHtml(p.alt)}" style="display:block;width:100%;max-width:${YOUTUBE_THUMB_WIDTH}px;height:auto;border:0;" />` +
    `</a>` +
    `<p style="margin:8px 0 0 0;${FONT}font-size:14px;line-height:20px;"><a href="${href}" target="_blank" style="color:#00A2E9;text-decoration:underline;">${escapeHtml(youtubeCaption(p.video))}</a></p>` +
    `</td></tr></table>`;
}

/** HoM plain-text equivalent: lead-in, blank line, "Watch: <title>", URL. */
export function youtubeThumbBlockText(p: YoutubePlacementCopy): string {
  return `${p.leadIn}\n\n${youtubeCaption(p.video)}\n${youtubeWatchUrl(p.video.id)}`;
}
