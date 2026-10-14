import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, activities, contacts, opportunities } from "@/db/schema";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  formatAmountMajor,
  isStage,
} from "@/lib/crm";
import { getCrmSessionUser } from "@/lib/crm-session";
import { updateOpportunityStage } from "../actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { LogActivityForm } from "@/components/crm/log-activity-form";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export default async function OpportunityDetailPage({ params }: Props) {
  const { id } = params;
  const sessionUser = await getCrmSessionUser();

  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
  if (!opp) notFound();

  const [account] = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, opp.accountId))
    .limit(1);

  let primaryContact: { id: string; email: string; firstname: string | null; lastname: string | null } | null = null;
  if (opp.primaryContactId) {
    const [c] = await db
      .select({
        id: contacts.id,
        email: contacts.email,
        firstname: contacts.firstname,
        lastname: contacts.lastname,
      })
      .from(contacts)
      .where(eq(contacts.id, opp.primaryContactId))
      .limit(1);
    primaryContact = c ?? null;
  }

  // Schema has no opportunityId on activities — timeline = primary contact activities
  const timeline = opp.primaryContactId
    ? await db
        .select()
        .from(activities)
        .where(eq(activities.contactId, opp.primaryContactId))
        .orderBy(desc(activities.performedAt))
        .limit(50)
    : [];

  const stage = isStage(opp.stage) ? opp.stage : "new";
  const closeStr = opp.closeDate
    ? new Date(opp.closeDate).toISOString().slice(0, 10)
    : "—";

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/dashboard" className="text-indigo-600 hover:underline">Dashboard</Link>
            {" / "}
            <Link href="/opportunities" className="text-indigo-600 hover:underline">Opportunities</Link>
            {" / Detail"}
          </p>
          <h1 className="text-3xl font-bold mt-1">{opp.name}</h1>
        </div>
        <a href="/api/auth/logout" className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline">Log out</a>
      </div>

      <section className="mb-8 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Account</dt>
            <dd className="font-medium">
              {account ? (
                <Link href={`/accounts/${account.id}`} className="text-indigo-600 hover:underline">{account.name}</Link>
              ) : (
                opp.accountId
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Stage</dt>
            <dd className="font-medium">{STAGE_LABELS[stage]}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Amount</dt>
            <dd className="font-medium">{formatAmountMajor(opp.amount, opp.currency || "GBP")}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Close date</dt>
            <dd className="font-medium">{closeStr}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Owner</dt>
            <dd className="font-medium">{opp.owner || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Primary contact</dt>
            <dd className="font-medium">
              {primaryContact ? (
                <Link href={`/contacts/${primaryContact.id}`} className="text-indigo-600 hover:underline">
                  {[primaryContact.firstname, primaryContact.lastname].filter(Boolean).join(" ") || "—"}
                  {" "}({primaryContact.email})
                </Link>
              ) : (
                opp.primaryContactId || "—"
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mb-8 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Update stage</h2>
        <form action={updateOpportunityStage} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="id" value={opp.id} />
          <div>
            <label htmlFor="stage" className="mb-1 block text-sm font-medium text-gray-700">Stage</label>
            <select
              id="stage"
              name="stage"
              defaultValue={stage}
              className="rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500">
            Save stage
          </button>
        </form>
      </section>

      {primaryContact ? (
        <LogActivityForm
          contactId={primaryContact.id}
          returnTo={`/opportunities/${opp.id}`}
          defaultPerformedBy={sessionUser || opp.owner || ""}
          hint="Logged against primary contact (activities.contactId — no opportunityId column in CoS schema)"
        />
      ) : (
        <section className="mb-8 rounded-lg border bg-amber-50 border-amber-200 p-4 text-sm text-amber-900">
          Set a primary contact on this opportunity to log activities and see a timeline.
        </section>
      )}

      <ActivityTimeline
        activities={timeline}
        subtitle="From primary contact activities (schema has no opportunityId FK)"
        emptyMessage={
          !opp.primaryContactId
            ? "No primary contact — timeline unavailable."
            : "No activities yet."
        }
      />
    </main>
  );
}
