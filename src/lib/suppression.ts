/**
 * Marketing suppression. The single source of truth is the existing contacts row:
 *   contacts.unsubscribed = true  (+ contacts.unsubscribed_at)
 * matched on lower(email). No new table, no migration.
 *
 * Written by:  POST /api/unsubscribe (confirm button and RFC 8058 one-click), the CRM contact
 *              PATCH (unsubscribed: true), and scripts/suppress-emails.ts (manual entry of mailto
 *              requests that land in support@).
 * Checked by:  every sender before it sends: worker/sequences (contact.unsubscribed),
 *              worker/trial-nurture (decide(): unsubscribed -> stop) and newsletter sends
 *              (assertSendable / partitionSendable below).
 *
 * Pure / store-injected so it is unit-testable without a DB (see suppressionDb.ts for the store).
 */

export function normalizeEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/;
export function isPlausibleEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}

export interface SuppressionStore {
  /** Lower-cased addresses from `emails` that are suppressed (contacts.unsubscribed = true). */
  suppressed(emails: string[]): Promise<Set<string>>;
  /**
   * Mark the address suppressed: set unsubscribed on every contact row with that lower(email)
   * (creating one if none exists) and cancel active sequence enrolments. Returns whether a new
   * contact row was created.
   */
  suppress(email: string, source: string): Promise<{ created: boolean }>;
}

/** Split recipients into sendable and suppressed. De-duplicates case-insensitively; drops invalid. */
export async function partitionSendable(emails: string[], store: SuppressionStore) {
  const seen = new Set<string>();
  const unique: string[] = [];
  const invalid: string[] = [];
  for (const e of emails) {
    const n = normalizeEmail(e);
    if (!isPlausibleEmail(n)) { invalid.push(e); continue; }
    if (!seen.has(n)) { seen.add(n); unique.push(n); }
  }
  const sup = unique.length ? await store.suppressed(unique) : new Set<string>();
  return {
    sendable: unique.filter((e) => !sup.has(e)),
    suppressed: unique.filter((e) => sup.has(e)),
    invalid,
  };
}

/** Throw unless this one address may be sent marketing email now. Call immediately before each send. */
export async function assertSendable(email: string, store: SuppressionStore): Promise<void> {
  const n = normalizeEmail(email);
  if (!isPlausibleEmail(n)) throw new Error("invalid recipient address");
  if ((await store.suppressed([n])).has(n)) throw new Error("recipient is suppressed (unsubscribed)");
}
