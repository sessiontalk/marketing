import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { contacts, sequenceEnrollments } from "../db/schema";
import { normalizeEmail, type SuppressionStore } from "./suppression";

/** Drizzle-backed SuppressionStore over contacts.unsubscribed (see suppression.ts). */
export const dbSuppressionStore: SuppressionStore = {
  async suppressed(emails) {
    const list = Array.from(new Set(emails.map(normalizeEmail))).filter(Boolean);
    if (!list.length) return new Set();
    const rows = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.unsubscribed, true), inArray(sql<string>`lower(${contacts.email})`, list)));
    return new Set(rows.map((r) => normalizeEmail(r.email)));
  },

  async suppress(email, source) {
    const n = normalizeEmail(email);
    const now = new Date();
    const updated = await db
      .update(contacts)
      .set({ unsubscribed: true, unsubscribedAt: now, updatedAt: now })
      .where(sql`lower(${contacts.email}) = ${n}`)
      .returning({ id: contacts.id });
    let created = false;
    let ids = updated.map((r) => r.id);
    if (!ids.length) {
      const ins = await db
        .insert(contacts)
        .values({ email: n, username: n, source: source.slice(0, 50), unsubscribed: true, unsubscribedAt: now })
        .onConflictDoUpdate({ target: contacts.email, set: { unsubscribed: true, unsubscribedAt: now, updatedAt: now } })
        .returning({ id: contacts.id });
      ids = ins.map((r) => r.id);
      created = true;
    }
    if (ids.length) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "cancelled" })
        .where(and(inArray(sequenceEnrollments.contactId, ids), eq(sequenceEnrollments.status, "active")));
    }
    return { created };
  },
};
