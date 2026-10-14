export const STAGE_ORDER = [
  "new",
  "qualified",
  "demo",
  "proposal",
  "won",
  "lost",
] as const;

export type Stage = (typeof STAGE_ORDER)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  qualified: "Qualified",
  demo: "Demo",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGE_ORDER as readonly string[]).includes(v);
}

/** Display integer cents as major units, e.g. 125099 -> "1,250.99" */
export function formatAmountMajor(cents: number | null | undefined, currency = "GBP"): string {
  if (cents == null) return "—";
  const major = cents / 100;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

/** Parse UI major-unit string/number into integer cents. Empty -> null. */
export function parseAmountToCents(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function emptyToNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export const ACTIVITY_TYPES = [
  "call",
  "email",
  "meeting",
  "note",
  "support",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  note: "Note",
  support: "Support",
};

export function isActivityType(v: unknown): v is ActivityType {
  return typeof v === "string" && (ACTIVITY_TYPES as readonly string[]).includes(v);
}

