import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { activities, contacts, emailEvents } from "../../db/schema";
import { dbSuppressionStore } from "../suppressionDb";
import type { EventStore } from "./process";
import type { SesEvent } from "./parse";

const SUBJECT: Record<string, (e: SesEvent) => string> = {
  open: (e) => `Newsletter opened${e.campaign ? ` (${e.campaign})` : ""}`,
  click: (e) => `Newsletter link clicked: ${e.link ?? ""}`.slice(0, 500),
  bounce: (e) => `Email bounced (${e.bounceType ?? "?"}/${e.bounceSubType ?? "?"})`,
  complaint: () => "Spam complaint — marked do-not-contact",
  unsubscribe: () => "Unsubscribed via SES — marked do-not-contact",
};

export const dbEventStore: EventStore = {
  async insertEvents(evs) {
    if (!evs.length) return new Set();
    const rows = await db.insert(emailEvents).values(evs.map((e) => ({
      eventKey: e.eventKey, sesMessageId: e.sesMessageId, kind: e.kind, recipient: e.recipient, contactId: e.contactId,
      occurredAt: e.occurredAt, campaign: e.campaign, variant: e.variant, link: e.link, userAgent: e.userAgent?.slice(0, 1000) ?? null,
      ipAddress: e.ipAddress, sesBotHint: e.sesBotHint, bounceType: e.bounceType, bounceSubType: e.bounceSubType, subject: e.subject?.slice(0, 500) ?? null,
    }))).onConflictDoNothing({ target: emailEvents.eventKey }).returning({ k: emailEvents.eventKey });
    return new Set(rows.map((r) => r.k));
  },
  async contactIdsByEmail(emails) {
    if (!emails.length) return new Map();
    const rows = await db.select({ id: contacts.id, email: contacts.email }).from(contacts).where(inArray(sql<string>`lower(${contacts.email})`, emails));
    return new Map(rows.map((r) => [r.email.toLowerCase(), r.id]));
  },
  async eventsForMessages(pairs) {
    if (!pairs.length) return [];
    const rows = await db.select().from(emailEvents).where(or(...pairs.map((p) => and(eq(emailEvents.sesMessageId, p.sesMessageId), eq(emailEvents.recipient, p.recipient)))));
    return rows.map((r) => ({ ...r, kind: r.kind as any, occurredAt: new Date(r.occurredAt), contactIdTag: null })) as any;
  },
  async setVerdicts(vs) {
    for (const v of vs) await db.update(emailEvents).set({ isBot: v.isBot, botReason: v.reason }).where(eq(emailEvents.eventKey, v.eventKey));
  },
  async createActivity(e) {
    const [a] = await db.insert(activities).values({ contactId: e.contactId, type: "email", subject: SUBJECT[e.kind]?.(e) ?? e.kind, body: JSON.stringify({ sesMessageId: e.sesMessageId, campaign: e.campaign, variant: e.variant, link: e.link }), performedBy: "ses-events", performedAt: e.occurredAt }).returning({ id: activities.id });
    // Guarded update: only the first writer links the activity (concurrent workers).
    await db.update(emailEvents).set({ activityId: a.id }).where(and(eq(emailEvents.eventKey, e.eventKey), sql`${emailEvents.activityId} is null`));
  },
  async suppress(email, reason) {
    await dbSuppressionStore.suppress(email, reason);
    await db.update(contacts).set({ doNotContactReason: reason }).where(and(sql`lower(${contacts.email}) = ${email}`, sql`${contacts.doNotContactReason} is null`));
  },
};
