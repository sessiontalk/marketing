import { classifyMessage, type Verdict } from "./classify";
import { parseSesRecord, suppressionReason, unwrap, type SesEvent } from "./parse";

/** Storage port: Drizzle impl in store.ts, in-memory impl in tests. All writes idempotent. */
export interface EventStore {
  /** Insert events ON CONFLICT (event_key) DO NOTHING. Returns keys actually inserted. */
  insertEvents(events: Array<SesEvent & { contactId: string | null }>): Promise<Set<string>>;
  contactIdsByEmail(emails: string[]): Promise<Map<string, string>>;
  eventsForMessages(pairs: Array<{ sesMessageId: string; recipient: string }>): Promise<Array<SesEvent & { contactId: string | null; activityId: string | null; isBot: boolean | null }>>;
  setVerdicts(v: Array<{ eventKey: string } & Verdict>): Promise<void>;
  /** Create CRM activity for a real (non-bot) engagement / suppression event, once. */
  createActivity(e: SesEvent & { contactId: string }): Promise<void>;
  /** Existing suppression path (contacts.unsubscribed + cancel enrolments) + dnc reason. */
  suppress(email: string, reason: string): Promise<void>;
}

const ACTIVITY_KINDS = new Set(["open", "click", "bounce", "complaint", "unsubscribe"]);

export interface ProcessResult { parsed: number; inserted: number; unparseable: number; suppressed: number; activities: number; bots: number }

/**
 * Process a batch of raw bodies (SQS bodies, SNS envelopes or raw SES records).
 * Throws on store errors => caller must NOT delete the SQS messages.
 */
export async function processBatch(bodies: unknown[], store: EventStore): Promise<ProcessResult & { okIndexes: number[] }> {
  const r: ProcessResult = { parsed: 0, inserted: 0, unparseable: 0, suppressed: 0, activities: 0, bots: 0 };
  const okIndexes: number[] = [];
  const all: SesEvent[] = [];
  bodies.forEach((b, i) => {
    const raw = unwrap(b);
    if (!raw) { r.unparseable++; return; }
    const evs = parseSesRecord(raw);
    if (!evs.length) { r.unparseable++; return; }
    all.push(...evs); okIndexes.push(i);
  });
  r.parsed = all.length;
  if (!all.length) return { ...r, okIndexes };

  const ids = await store.contactIdsByEmail(Array.from(new Set(all.map((e) => e.recipient))));
  const inserted = await store.insertEvents(all.map((e) => ({ ...e, contactId: ids.get(e.recipient) ?? null })));
  r.inserted = inserted.size;

  // Suppression is idempotent; apply for every suppression event seen (even if already stored).
  const supp = new Map<string, string>();
  for (const e of all) { const why = suppressionReason(e); if (why && !supp.has(e.recipient)) supp.set(e.recipient, why); }
  for (const [email, why] of supp) { await store.suppress(email, why); r.suppressed++; }

  // Re-classify every touched message using ALL its stored events, then promote real ones to activities.
  const pairs = Array.from(new Map(all.map((e) => [`${e.sesMessageId}|${e.recipient}`, { sesMessageId: e.sesMessageId, recipient: e.recipient }])).values());
  const stored = await store.eventsForMessages(pairs);
  const byMsg = new Map<string, typeof stored>();
  for (const e of stored) { const k = `${e.sesMessageId}|${e.recipient}`; (byMsg.get(k) ?? byMsg.set(k, []).get(k)!).push(e); }
  const verdicts: Array<{ eventKey: string } & Verdict> = [];
  for (const g of byMsg.values()) {
    const v = classifyMessage(g);
    for (const e of g) {
      const vv = v.get(e.eventKey);
      if (vv && vv.isBot !== e.isBot) verdicts.push({ eventKey: e.eventKey, ...vv });
      const isBot = vv?.isBot ?? false;
      if (isBot) r.bots++;
      if (!isBot && ACTIVITY_KINDS.has(e.kind) && e.contactId && !e.activityId) { await store.createActivity({ ...e, contactId: e.contactId }); r.activities++; }
    }
  }
  if (verdicts.length) await store.setVerdicts(verdicts);
  return { ...r, okIndexes };
}
