"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { emptyToNull, isActivityType } from "@/lib/crm";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

async function sessionUsername(): Promise<string | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  return session?.u ?? null;
}

export async function logActivity(formData: FormData) {
  const contactId = String(formData.get("contactId") || "").trim();
  if (!contactId) throw new Error("Contact is required");

  const typeRaw = String(formData.get("type") || "").trim();
  if (!isActivityType(typeRaw)) throw new Error("Invalid activity type");

  const subject = emptyToNull(formData.get("subject"));
  const body = emptyToNull(formData.get("body"));
  let performedBy = emptyToNull(formData.get("performedBy"));
  if (!performedBy) {
    performedBy = (await sessionUsername()) || null;
  }

  const [contact] = await db
    .select({ id: contacts.id, accountId: contacts.accountId })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact) throw new Error("Contact not found");

  await db.insert(activities).values({
    contactId,
    type: typeRaw,
    subject,
    body,
    performedBy,
    performedAt: new Date(),
  });

  revalidatePath(`/contacts/${contactId}`);
  if (contact.accountId) {
    revalidatePath(`/accounts/${contact.accountId}`);
  }
  const returnTo = emptyToNull(formData.get("returnTo"));
  if (returnTo && returnTo.startsWith("/")) {
    revalidatePath(returnTo);
  }
}
