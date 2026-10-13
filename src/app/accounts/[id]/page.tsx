import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, activities, contacts, opportunities } from "@/db/schema";
import { STAGE_LABELS, formatAmountMajor, isStage } from "@/lib/crm";
import { getCrmSessionUser } from "@/lib/crm-session";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { LogActivityForm } from "@/components/crm/log-activity-form";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export default async function AccountDetailPage({ params }: Props) {
  const { id } = params;
  const sessionUser = await getCrmSessionUser();

  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) notFound();

  const linkedContacts = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      firstname: contacts.firstname,
      lastname: contacts.lastname,
      phone: contacts.phone,
      country: contacts.country,
    })
    .from(contacts)
    .where(eq(contacts.accountId, id))
    .orderBy(desc(contacts.createdAt))
    .limit(100);

  const relatedOpps = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.accountId, id))
    .orderBy(desc(opportunities.createdAt))
    .limit(100);

  // Also include primary contacts on related opps (even if not account-linked)
  const oppPrimaryIds = relatedOpps
    .map((o) => o.primaryContactId)
    .filter((cid): cid is string => !!cid);

  const contactIdSet = new Set([
    ...linkedContacts.map((c) => c.id),
    ...oppPrimaryIds,
  ]);
  const contactIds = [...contactIdSet];

  const contactLabel: Record<string, string> = {};
  for (const c of linkedContacts) {
    contactLabel[c.id] =
      [c.firstname, c.lastname].filter(Boolean).join(" ") || c.email;
  }

  // Resolve labels for opp-primary contacts not already in linkedContacts
  const missingIds = oppPrimaryIds.filter((cid) => !contactLabel[cid]);
  if (missingIds.length > 0) {
    const extra = await db
      .select({
        id: contacts.id,
        email: contacts.email,
        firstname: contacts.firstname,
        lastname: contacts.lastname,
      })
      .from(contacts)
      .where(inArray(contacts.id, missingIds));
    for (const c of extra) {
      contactLabel[c.id] =
        [c.firstname, c.lastname].filter(Boolean).join(" ") || c.email;
    }
  }

  const timeline =
    contactIds.length === 0
      ? []
      : await db
          .select()
          .from(activities)
          .where(inArray(activities.contactId, contactIds))
          .orderBy(desc(activities.performedAt))
          .limit(100);

  const contactOptions = linkedContacts.map((c) => ({
    id: c.id,
    label: [c.firstname, c.lastname].filter(Boolean).join(" ") || c.email,
  }));

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/dashboard" className="text-indigo-600 hover:underline">Dashboard</Link>
            {" / "}
            <Link href="/accounts" className="text-indigo-600 hover:underline">Accounts</Link>
            {" / Detail"}
          </p>
          <h1 className="text-3xl font-bold mt-1">{account.name}</h1>
        </div>
        <a href="/api/auth/logout" className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline">Log out</a>
      </div>

      <section className="mb-8 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Account</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><dt className="text-gray-500">Website</dt><dd className="font-medium">{account.website || "—"}</dd></div>
          <div><dt className="text-gray-500">Country</dt><dd className="font-medium">{account.country || "—"}</dd></div>
          <div><dt className="text-gray-500">Phone</dt><dd className="font-medium">{account.phone || "—"}</dd></div>
          <div><dt className="text-gray-500">Owner</dt><dd className="font-medium">{account.owner || "—"}</dd></div>
          <div className="md:col-span-2"><dt className="text-gray-500">Notes</dt><dd className="font-medium whitespace-pre-wrap">{account.notes || "—"}</dd></div>
        </dl>
      </section>

      <section className="mb-8 rounded-lg border bg-white overflow-hidden">
        <div className="px-6 py-4 border-b"><h2 className="text-lg font-semibold">Linked contacts ({linkedContacts.length})</h2></div>
        {linkedContacts.length === 0 ? (
          <p className="p-6 text-gray-500">No contacts linked via accountId.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Phone</th>
                  <th className="px-6 py-3 font-medium">Country</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linkedContacts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">
                      <Link href={`/contacts/${c.id}`} className="text-indigo-600 hover:underline">
                        {[c.firstname, c.lastname].filter(Boolean).join(" ") || "—"}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{c.email}</td>
                    <td className="px-6 py-3 text-gray-600">{c.phone || "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{c.country || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8 rounded-lg border bg-white overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Related opportunities ({relatedOpps.length})</h2>
          <Link href="/opportunities" className="text-sm text-indigo-600 hover:underline">View pipeline</Link>
        </div>
        {relatedOpps.length === 0 ? (
          <p className="p-6 text-gray-500">No opportunities for this account.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Stage</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Owner</th>
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
                    <td className="px-6 py-3 text-gray-600">{o.owner || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {linkedContacts.length === 0 ? (
        <section className="mb-8 rounded-lg border bg-amber-50 border-amber-200 p-4 text-sm text-amber-900">
          Link a contact to this account first — activities are stored against contacts (CoS schema; contactId FK only).
        </section>
      ) : (
        <LogActivityForm
          contacts={contactOptions}
          returnTo={`/accounts/${account.id}`}
          defaultPerformedBy={sessionUser || account.owner || ""}
        />
      )}

      <ActivityTimeline
        activities={timeline}
        contactLabels={contactLabel}
        subtitle="Activities for linked contacts and opportunity primary contacts (schema has contactId only — no accountId column)"
        emptyMessage="No activities for linked contacts yet."
      />
    </main>
  );
}
