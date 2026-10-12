/**
 * Hard kill switch for ALL automated drip/nurture email.
 * Default OFF: anything other than the exact string "true" disables sending,
 * so a deploy without the env var sends nothing.
 */
export function isDripSendingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DRIP_SENDING_ENABLED === "true";
}

/**
 * Legacy softphone-era "Welcome Drip" sequence(s). Retired 2026-10-12; must never send,
 * even if a row is flipped back to active in the DB.
 */
export const RETIRED_SEQUENCE_NAMES = new Set(["Welcome Drip"]);
