"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, opportunities } from "@/db/schema";
import { emptyToNull, isStage, parseAmountToCents } from "@/lib/crm";

export async function createOpportunity(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Name is required");

  const accountId = String(formData.get("accountId") || "").trim();
  if (!accountId) throw new Error("Account is required");

  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) throw new Error("Account not found");

  const stageRaw = String(formData.get("stage") || "new").trim();
  const stage = isStage(stageRaw) ? stageRaw : "new";
  const amount = parseAmountToCents(formData.get("amount"));
  const closeRaw = emptyToNull(formData.get("closeDate"));
  const closeDate = closeRaw ? new Date(closeRaw) : null;
  if (closeDate && Number.isNaN(closeDate.getTime())) throw new Error("Invalid close date");

  const [row] = await db
    .insert(opportunities)
    .values({
      name,
      accountId,
      primaryContactId: emptyToNull(formData.get("primaryContactId")),
      amount,
      closeDate,
      owner: emptyToNull(formData.get("owner")),
      stage,
      currency: "GBP",
    })
    .returning({ id: opportunities.id });

  revalidatePath("/opportunities");
  revalidatePath(`/accounts/${accountId}`);
  redirect(`/opportunities/${row.id}`);
}

export async function updateOpportunityStage(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const stageRaw = String(formData.get("stage") || "").trim();
  if (!id) throw new Error("Missing id");
  if (!isStage(stageRaw)) throw new Error("Invalid stage");

  const [existing] = await db
    .select({ accountId: opportunities.accountId })
    .from(opportunities)
    .where(eq(opportunities.id, id))
    .limit(1);

  await db
    .update(opportunities)
    .set({ stage: stageRaw, updatedAt: new Date() })
    .where(eq(opportunities.id, id));

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${id}`);
  if (existing?.accountId) {
    revalidatePath(`/accounts/${existing.accountId}`);
  }
  redirect(`/opportunities/${id}`);
}