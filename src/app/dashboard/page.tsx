import Link from "next/link";
import { db } from "@/db";
import { contacts, campaigns, sequences, sendLogs, opportunities } from "@/db/schema";
import { sql } from "drizzle-orm";
import { STAGE_ORDER, STAGE_LABELS, formatAmountMajor, isStage } from "@/lib/crm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [contactCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts);

  const [unsubscribedCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(sql`unsubscribed = true`);

  const [campaignCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(campaigns);

  const [sequenceCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sequences);

  const [sentCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sendLogs)
    .where(sql`status = 'sent'`);

  const pipelineRows = await db
    .select({
      stage: opportunities.stage,
      count: sql<number>`count(*)::int`,
      amountSum: sql<number>`coalesce(sum(${opportunities.amount}), 0)::int`,
    })
    .from(opportunities)
    .groupBy(opportunities.stage);

  const byStage = Object.fromEntries(
    STAGE_ORDER.map((s) => [s, { count: 0, amountSum: 0 }])
  ) as Record<(typeof STAGE_ORDER)[number], { count: number; amountSum: number }>;

  let pipelineTotalCount = 0;
  let pipelineTotalAmount = 0;
  for (const row of pipelineRows) {
    const count = Number(row.count) || 0;
    const amountSum = Number(row.amountSum) || 0;
    pipelineTotalCount += count;
    pipelineTotalAmount += amountSum;
    if (isStage(row.stage)) {
      byStage[row.stage] = { count, amountSum };
    } else {
      byStage.new.count += count;
      byStage.new.amountSum += amountSum;
    }
  }

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">SessionTalk Marketing</h1>
        <a
          href="/api/auth/logout"
          className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline"
        >
          Log out
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Contacts" value={contactCount?.count ?? 0} />
        <StatCard
          label="Unsubscribed"
          value={unsubscribedCount?.count ?? 0}
          variant="warning"
        />
        <StatCard label="Campaigns" value={campaignCount?.count ?? 0} />
        <StatCard label="Sequences" value={sequenceCount?.count ?? 0} />
        <StatCard label="Emails Sent" value={sentCount?.count ?? 0} />
      </div>

      <section className="mt-10 rounded-lg border bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Pipeline summary</h2>
            <p className="text-sm text-gray-500">
              {pipelineTotalCount} opportunities · {formatAmountMajor(pipelineTotalAmount, "GBP")} total
            </p>
          </div>
          <Link href="/opportunities" className="text-sm text-indigo-600 hover:underline">
            Open pipeline
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className="rounded-lg border bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500">{STAGE_LABELS[stage]}</p>
              <p className="text-xl font-bold mt-1">{byStage[stage].count}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {formatAmountMajor(byStage[stage].amountSum, "GBP")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        <a
          href="/import"
          className="block p-6 border rounded-lg hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-2">📥 Import CSV</h2>
          <p className="text-gray-600">
            Upload contacts from sessioncloud-users.csv
          </p>
        </a>

        <a
          href="/sequences"
          className="block p-6 border rounded-lg hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-2">📬 Sequences</h2>
          <p className="text-gray-600">
            Manage welcome email drip campaigns
          </p>
        </a>

        <a
          href="/campaigns"
          className="block p-6 border rounded-lg hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-2">📧 Campaigns</h2>
          <p className="text-gray-600">
            Create and send email newsletters
          </p>
        </a>

        <a
          href="/contacts"
          className="block p-6 border rounded-lg hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-2">👥 Contacts</h2>
          <p className="text-gray-600">
            Browse and filter your contact list
          </p>
        </a>

        <a
          href="/accounts"
          className="block p-6 border rounded-lg hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-2">🏢 Accounts</h2>
          <p className="text-gray-600">
            Company records and linked contacts
          </p>
        </a>

        <a
          href="/opportunities"
          className="block p-6 border rounded-lg hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-2">💼 Opportunities</h2>
          <p className="text-gray-600">
            Pipeline staged by new → won/lost
          </p>
        </a>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "warning";
}) {
  return (
    <div
      className={`p-4 border rounded-lg ${
        variant === "warning" ? "border-yellow-300 bg-yellow-50" : "bg-white"
      }`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{Number(value).toLocaleString()}</p>
    </div>
  );
}
