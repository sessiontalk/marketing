import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, unsubscribeTokens, sequenceEnrollments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const [record] = await db
    .select()
    .from(unsubscribeTokens)
    .where(eq(unsubscribeTokens.token, token));

  if (!record) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  // Mark contact as unsubscribed
  await db
    .update(contacts)
    .set({
      unsubscribed: true,
      unsubscribedAt: new Date(),
    })
    .where(eq(contacts.id, record.contactId));

  // Cancel any active sequence enrollments
  await db
    .update(sequenceEnrollments)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(sequenceEnrollments.contactId, record.contactId),
        eq(sequenceEnrollments.status, "active")
      )
    );

  // Return a simple confirmation page
  return new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head><title>Unsubscribed</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>You've been unsubscribed</h1>
        <p>You will no longer receive emails from SessionTalk.</p>
        <p><a href="https://sessiontalk.co.uk">Return to SessionTalk</a></p>
      </body>
    </html>`,
    {
      headers: { "Content-Type": "text/html" },
    }
  );
}

export async function POST(req: NextRequest) {
  // RFC 8058 one-click unsubscribe
  return GET(req);
}
