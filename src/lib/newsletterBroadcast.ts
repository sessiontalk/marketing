import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { contacts } from "../db/schema";
import { isPlausibleEmail, normalizeEmail } from "./suppression";
import { NEWSLETTER_SEED_SOURCE } from "./newsletter";

/**
 * Real (multi-recipient) newsletter broadcast: recipient filtering and the send loop.
 * Pure / dependency-injected so it is unit-testable without a DB or SES
 * (the CLI wiring is scripts/newsletter-issue01/send-newsletter-issue01.ts).
 *
 * Never broadcast to: the seed inbox (naumansulaiman@googlemail.com / gmail.com and any +alias),
 * contacts with source = 'newsletter_seed', contacts.unsubscribed = true, the SES suppression CSV,
 * or contacts that already hold a newsletter_sent activity for this campaign.
 */

export const SEED_INBOX_RE = /^naumansulaiman(\+[^@]*)?@(googlemail|gmail)\.com$/i;

export type ExclusionReason =
  | "invalid"
  | "duplicate"
  | "seed_inbox"
  | "seed_contact"
  | "unsubscribed"
  | "ses_suppressed"
  | "already_sent";

export interface BroadcastContact {
  id: string;
  email: string;
  source: string | null;
  unsubscribed: boolean | null;
}

export interface BroadcastRow { email: string; variant: string }
export interface PlannedSend { email: string; variant: string; contactId: string | null }

/** SQL condition for loading broadcast contacts: never seed contacts, never unsubscribed. */
export function broadcastContactWhere() {
  return and(
    or(isNull(contacts.source), ne(contacts.source, NEWSLETTER_SEED_SOURCE)),
    or(isNull(contacts.unsubscribed), eq(contacts.unsubscribed, false)),
    sql`lower(${contacts.email}) !~ ${"^naumansulaiman(\\+[^@]*)?@(googlemail|gmail)\\.com$"}`
  );
}

/** Why this contact must not get a broadcast (null = OK). Belt-and-braces with broadcastContactWhere(). */
export function contactExclusion(c: Pick<BroadcastContact, "email" | "source" | "unsubscribed">): ExclusionReason | null {
  if (SEED_INBOX_RE.test(normalizeEmail(c.email))) return "seed_inbox";
  if ((c.source || "").trim().toLowerCase() === NEWSLETTER_SEED_SOURCE) return "seed_contact";
  if (c.unsubscribed) return "unsubscribed";
  return null;
}

/**
 * Plan a broadcast. `contactsByEmail` holds EVERY existing contact row for the listed addresses
 * (lower(email) -> row, unfiltered, so exclusions are visible); missing = a contact row will be created.
 */
export function planBroadcast(input: {
  rows: BroadcastRow[];
  contactsByEmail: Map<string, BroadcastContact>;
  alreadySentContactIds: Set<string>;
  sesSuppressed?: Set<string>;
}) {
  const seen = new Set<string>();
  const send: PlannedSend[] = [];
  const excluded: Record<ExclusionReason, number> = {
    invalid: 0, duplicate: 0, seed_inbox: 0, seed_contact: 0, unsubscribed: 0, ses_suppressed: 0, already_sent: 0,
  };
  for (const r of input.rows) {
    const email = normalizeEmail(r.email);
    if (!isPlausibleEmail(email)) { excluded.invalid++; continue; }
    if (seen.has(email)) { excluded.duplicate++; continue; }
    seen.add(email);
    if (SEED_INBOX_RE.test(email)) { excluded.seed_inbox++; continue; }
    const c = input.contactsByEmail.get(email);
    if (c) {
      const why = contactExclusion(c);
      if (why) { excluded[why]++; continue; }
    }
    if (input.sesSuppressed?.has(email)) { excluded.ses_suppressed++; continue; }
    if (c && input.alreadySentContactIds.has(c.id)) { excluded.already_sent++; continue; }
    send.push({ email, variant: r.variant, contactId: c ? c.id : null });
  }
  return { send, excluded, toCreate: send.filter((s) => !s.contactId).length };
}

export interface BroadcastDeps {
  /** Re-check suppression right before the send (throws if suppressed). */
  assertSendable(email: string): Promise<void>;
  /** Ensure a contacts row exists (create if missing) and return its id; must refuse seed/unsubscribed rows. */
  ensureContact(email: string): Promise<string>;
  /** Atomic once-per-(campaign, contact) claim. false = already claimed by an earlier run: skip. */
  claim(campaign: string, contactId: string): Promise<boolean>;
  /** Build, send and log one message (unsubscribe token + SES send + newsletter_sent activity). */
  sendOne(p: PlannedSend & { contactId: string }): Promise<{ id: string }>;
  /** Record a failed attempt (claim stays, so it is never auto-retried). */
  recordFailure(contactId: string, err: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
}

export interface BroadcastOptions {
  campaign: string;
  limit?: number;
  ratePerSecond: number; // e.g. 2
  maxFailureRate: number; // e.g. 0.02
}

/** Generic error text only (never echo provider payloads that might carry secrets). */
function safeError(e: unknown): string {
  const name = (e as any)?.name || "Error";
  const msg = String((e as any)?.message || "").replace(/[A-Za-z0-9_\-+/=]{24,}/g, "<redacted>").slice(0, 200);
  return `${name}: ${msg}`;
}

export async function runBroadcast(plan: PlannedSend[], deps: BroadcastDeps, o: BroadcastOptions) {
  if (!(o.ratePerSecond > 0)) throw new Error("ratePerSecond must be > 0");
  const gapMs = Math.ceil(1000 / o.ratePerSecond);
  const queue = typeof o.limit === "number" ? plan.slice(0, Math.max(0, o.limit)) : plan;
  let sent = 0, failed = 0, skipped = 0, stopped = false;
  for (const p of queue) {
    let contactId: string | null = null;
    try {
      try { await deps.assertSendable(p.email); }
      catch { skipped++; deps.log(`skip (suppressed or invalid at send time) ${p.variant}`); continue; }
      contactId = p.contactId ?? (await deps.ensureContact(p.email));
      if (!(await deps.claim(o.campaign, contactId))) { skipped++; deps.log(`skip (already claimed) ${p.variant}`); continue; }
      const out = await deps.sendOne({ ...p, contactId });
      sent++;
      deps.log(`SENT ${p.variant} contact=${contactId} MessageId=${out.id}`);
    } catch (e) {
      failed++;
      const err = safeError(e);
      deps.log(`FAILED ${p.variant} contact=${contactId ?? "-"} ${err}`);
      if (contactId) { try { await deps.recordFailure(contactId, err); } catch { /* logged above */ } }
    }
    const attempted = sent + failed;
    if (failed > 0 && failed / attempted > o.maxFailureRate) {
      stopped = true;
      deps.log(`STOP: failure rate ${failed}/${attempted} > ${o.maxFailureRate}`);
      break;
    }
    await deps.sleep(gapMs);
  }
  return { sent, failed, skipped, stopped, attempted: sent + failed, planned: queue.length };
}
