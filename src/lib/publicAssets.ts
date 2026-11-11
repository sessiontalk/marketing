/**
 * Static files that must load without a CRM session because they are embedded in
 * outgoing email (recipients have no cookie). Deliberately narrow: only the
 * YouTube thumbnail JPEGs under public/email/youtube/. Everything else keeps the
 * existing auth + /api/events/, /api/worker/, /api/unsubscribe allowlist.
 */
export const PUBLIC_EMAIL_ASSET_RE = /^\/email\/youtube\/[a-z0-9-]+\.jpg$/;

export function isPublicEmailAsset(pathname: string): boolean {
  return PUBLIC_EMAIL_ASSET_RE.test(pathname);
}
