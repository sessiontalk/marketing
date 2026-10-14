import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { accounts, activities, contacts, opportunities } from "@/db/schema";
import { STAGE_LABELS, formatAmountMajor, isStage } from "@/lib/crm";
import { getCrmSessionUser } from "@/lib/crm-session";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { LogActivityForm } from "@/components/crm/log-activity-form";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export default async function ContactDetailPage({ params }: Props) {
  const { id } = params;
  const sessionUser = await getCrmSessionUser();

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!contact) notFound();

  let account: { id: string; name: string } | null = null;
  if (contact.accountId) {
    const [a] = await db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, contact.accountId))
      .limit(1);
    account = a ?? null;
  }

  const relatedOpps = await db
    .select()
    .from(opportunities)
    .where(
      contact.accountId
        ? or(
            eq(opportunities.primaryContactId, id),
            eq(opportunities.accountId, contact.accountId)
          )
        : eq(opportunities.primaryContactId, id)
    )
    .orderBy(desc(opportunities.createdAt))
    .limit(100);

  const timeline = await db
    .select()
    .from(activities)
    .where(eq(activities.contactId, id))
    .orderBy(desc(activities.performedAt))
    .limit(100);

  const displayName =
    [contact.firstname, contact.lastname].filter(Boolean).join(" ") || contact.email;

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/dashboard" className="text-indigo-600 hover:underline">Dashboard</Link>
            {" / "}
            <Link href="/contacts" className="text-indigo-600 hover:underline">Contacts</Link>
            {" / Detail"}
          </p>
          <h1 className="text-3xl font-bold mt-1">{displayName}</h1>
        </div>
        <a href="/api/auth/logout" className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline">Log out</a>
      </div>

      <section className="mb-8 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Contact</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><dt className="text-gray-500">Email</dt><dd className="font-medium">{contact.email}</dd></div>
          <div><dt className="text-gray-500">Phone</dt><dd className="font-medium">{contact.phone || "—"}</dd></div>
          <div><dt className="text-gray-500">Country</dt><dd className="font-medium">{contact.country || "—"}</dd></div>
          <div><dt className="text-gray-500">Website</dt><dd className="font-medium">{contact.website || "—"}</dd></div>
          <div>
            <dt className="text-gray-500">Account</dt>
            <dd className="font-medium">
              {account ? (
                <Link href={`/accounts/${account.id}`} className="text-indigo-600 hover:underline">{account.name}</Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div><dt className="text-gray-500">Source</dt><dd className="font-medium">{contact.source || "—"}</dd></div>
        </dl>
      </section>

      <section className="mb-8 rounded-lg border bg-white overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Related opportunities ({relatedOpps.length})</h2>
          <Link href="/opportunities" className="text-sm text-indigo-600 hover:underline">View pipeline</Link>
        </div>
        {relatedOpps.length === 0 ? (
          <p className="p-6 text-gray-500">No opportunities linked to this contact or their account.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Stage</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {relatedOpps.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">
                      <Link href={`/opportunities/${o.id}`} className="text-indigo-600 hover:underline">{o.name}</Link>
                    </td>
                    <td className="px-6 py-3">{isStage(o.stage) ? STAGE_LABELS[o.stage] : o.stage}</td>
                    <td className="px-6 py-3">{formatAmountMajor(o.amount, o.currency || "GBP")}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {o.primaryContactId === id ? "Primary" : "Account"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LogActivityForm
        contactId={contact.id}
        returnTo={`/contacts/${contact.id}`}
        defaultPerformedBy={sessionUser || ""}
      />

      <ActivityTimeline
        activities={timeline}
        emptyMessage="No activities yet."
      />
    </main>
  );
}
