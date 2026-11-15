// Ad-click attribution + signup source from the SessionCloud signup webhook.
// The payload is HMAC-signed by SessionCloud, but values originate in a browser: whitelist + cap.
export const AD_ATTRIBUTION_KEYS = [
  "gclid", "gbraid", "wbraid",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
] as const;
const EXTRA_KEYS = ["landing_url", "captured_at"] as const;
export type AdAttribution = Partial<
  Record<(typeof AD_ATTRIBUTION_KEYS)[number] | (typeof EXTRA_KEYS)[number], string>
>;

export const SIGNUP_METHODS = ["website_inline", "register_spa", "google"] as const;
export type SignupMethod = (typeof SIGNUP_METHODS)[number];

export function sanitizeAdAttribution(input: unknown): AdAttribution | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  const out: AdAttribution = {};
  for (const k of [...AD_ATTRIBUTION_KEYS, ...EXTRA_KEYS]) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 255);
  }
  return AD_ATTRIBUTION_KEYS.some((k) => out[k]) ? out : null;
}

/** A site path such as "/hosted-pbx-branded-softphones-googleads". No host, query or junk. */
export function sanitizeSignupSourcePage(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!/^\/[a-z0-9\-/]{0,254}$/i.test(v)) return null;
  return v;
}

export function sanitizeSignupMethod(input: unknown): SignupMethod | null {
  return typeof input === "string" && (SIGNUP_METHODS as readonly string[]).includes(input)
    ? (input as SignupMethod)
    : null;
}

/** Columns to set on contacts, only for fields present in the payload (older SessionCloud builds send none). */
export function signupAttributionColumns(body: Record<string, unknown>) {
  const adAttribution = sanitizeAdAttribution(body.ad_attribution);
  const signupSourcePage = sanitizeSignupSourcePage(body.signup_source_page);
  const signupMethod = sanitizeSignupMethod(body.signup_method);
  return {
    ...(adAttribution ? { adAttribution } : {}),
    ...(signupSourcePage ? { signupSourcePage } : {}),
    ...(signupMethod ? { signupMethod } : {}),
  };
}
