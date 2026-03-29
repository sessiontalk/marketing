import { db } from "@/db";
import { contacts, campaigns, sequences, sendLogs } from "@/db/schema";
import { sql } from "drizzle-orm";

export default async function DashboardPage() {
  // These queries run at build/request time on the server
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

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">SessionTalk Marketing</h1>

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
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}
