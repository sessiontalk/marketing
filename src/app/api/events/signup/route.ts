import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, sequences, sequenceEnrollments } from "@/db/schema";
import { verifyWebhookSignature } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";

  // Verify signature
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.event !== "signup") {
    return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
  }

  const { email, firstname, lastname, phone, website, country, objectId, created_at } = body;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Upsert contact
  const [contact] = await db
    .insert(contacts)
    .values({
      objectId,
      email,
      username: email,
      firstname,
      lastname,
      phone,
      website,
      country,
      source: "webhook",
      originalCreatedAt: created_at ? new Date(created_at) : undefined,
    })
    .onConflictDoUpdate({
      target: contacts.email,
      set: {
        firstname,
        lastname,
        phone,
        website,
        country,
        updatedAt: new Date(),
      },
    })
    .returning();

  // Auto-enroll in active signup sequences
  const signupSequences = await db
    .select()
    .from(sequences)
    .where(eq(sequences.triggerEvent, "signup"))
    .where(eq(sequences.active, true));

  const enrollments = [];
  for (const sequence of signupSequences) {
    const [enrollment] = await db
      .insert(sequenceEnrollments)
      .values({
        contactId: contact.id,
        sequenceId: sequence.id,
        currentStepOrder: 0,
        status: "active",
        nextSendAt: new Date(), // First email goes immediately (delay handled by step config)
      })
      .onConflictDoNothing()
      .returning();
    if (enrollment) enrollments.push(enrollment);
  }

  return NextResponse.json({
    success: true,
    contactId: contact.id,
    enrollments: enrollments.length,
  });
}
