"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { emptyToNull } from "@/lib/crm";

export async function createAccount(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Name is required");

  const [row] = await db
    .insert(accounts)
    .values({
      name,
      website: emptyToNull(formData.get("website")),
      country: emptyToNull(formData.get("country")),
      phone: emptyToNull(formData.get("phone")),
      owner: emptyToNull(formData.get("owner")),
      notes: emptyToNull(formData.get("notes")),
    })
    .returning({ id: accounts.id });

  revalidatePath("/accounts");
  redirect(`/accounts/${row.id}`);
}