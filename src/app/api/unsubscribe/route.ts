import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, unsubscribeTokens, sequenceEnrollments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { handleUnsubscribe, type UnsubscribeStore } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

const store: UnsubscribeStore = {
  async tokenExists(token) {
    const [record] = await db.select({ token: unsubscribeTokens.token }).from(unsubscribeTokens).where(eq(unsubscribeTokens.token, token));
    return !!record;
  },
  async unsubscribe(token) {
    const [record] = await db.select().from(unsubscribeTokens).where(eq(unsubscribeTokens.token, token));
    if (!record) return false;
    await db.update(contacts).set({ unsubscribed: true, unsubscribedAt: new Date() }).where(eq(contacts.id, record.contactId));
    await db.update(sequenceEnrollments).set({ status: "cancelled" })
      .where(and(eq(sequenceEnrollments.contactId, record.contactId), eq(sequenceEnrollments.status, "active")));
    return true;
  },
};

function html({ status, html }: { status: number; html: string }) {
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Shows a confirm page only. Never unsubscribes (scanners and prefetchers follow GET links). */
export async function GET(req: NextRequest) {
  return html(await handleUnsubscribe("GET", req.nextUrl.searchParams.get("token"), store));
}

/**
 * Unsubscribes. Used by the confirm button and by RFC 8058 one-click: the mailbox provider POSTs
 * "List-Unsubscribe=One-Click" to the List-Unsubscribe URL, which carries ?token= in the query.
 */
export async function POST(req: NextRequest) {
  let token = req.nextUrl.searchParams.get("token");
  if (!token) {
    try {
      const form = await req.formData();
      const v = form.get("token");
      token = typeof v === "string" ? v : null;
    } catch { /* not a form body */ }
  }
  return html(await handleUnsubscribe("POST", token, store));
}
