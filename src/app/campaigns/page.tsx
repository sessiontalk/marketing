import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { isDripSendingEnabled } from "@/lib/killSwitch";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London" }) : "-");

// Read-only: lists campaigns with status and send counts. No send actions.
export default async function CampaignsPage() {
  const dripOn = isDripSendingEnabled(process.env);
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(200);

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/dashboard" className="text-indigo-600 hover:underline">Dashboard</Link> / Campaigns
          </p>
          <h1 className="text-3xl font-bold mt-1">Campaigns</h1>
        </div>
        <a href="/api/auth/logout" className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline">Log out</a>
      </div>
      <p className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Read-only view. Email sending is {dripOn ? "ENABLED" : "disabled"} (DRIP_SENDING_ENABLED). Nothing on this page sends email.
      </p>
      <section className="rounded-lg border bg-white overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">All campaigns</h2>
          <span className="text-sm text-gray-500">{rows.length} shown</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-gray-500">No campaigns yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Recipients</th>
                  <th className="px-6 py-3 font-medium">Sent</th>
                  <th className="px-6 py-3 font-medium">Failed</th>
                  <th className="px-6 py-3 font-medium">Scheduled</th>
                  <th className="px-6 py-3 font-medium">Sent at</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">{c.name}</td>
                    <td className="px-6 py-3 text-gray-600">{c.status ?? "draft"}</td>
                    <td className="px-6 py-3 text-gray-600">{c.totalRecipients ?? 0}</td>
                    <td className="px-6 py-3 text-gray-600">{c.totalSent ?? 0}</td>
                    <td className="px-6 py-3 text-gray-600">{c.totalFailed ?? 0}</td>
                    <td className="px-6 py-3 text-gray-600">{fmt(c.scheduledAt)}</td>
                    <td className="px-6 py-3 text-gray-600">{fmt(c.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}