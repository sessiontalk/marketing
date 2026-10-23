import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, unsubscribeTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { handleUnsubscribe, makeUnsubscribeStore, postToken } from "@/lib/unsubscribe";
import { dbSuppressionStore } from "@/lib/suppressionDb";

export const dynamic = "force-dynamic";

const store = makeUnsubscribeStore({
  async emailForToken(token) {
    const [row] = await db
      .select({ email: contacts.email })
      .from(unsubscribeTokens)
      .innerJoin(contacts, eq(unsubscribeTokens.contactId, contacts.id))
      .where(eq(unsubscribeTokens.token, token));
    return row ? row.email : null;
  },
  suppression: dbSuppressionStore,
});

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
  let form: FormData | null = null;
  const queryToken = req.nextUrl.searchParams.get("token");
  if (!queryToken) {
    try { form = await req.formData(); } catch { /* not a form body */ }
  }
  return html(await handleUnsubscribe("POST", postToken(queryToken, form), store));
}
