import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { accounts, opportunities } from "@/db/schema";
import { STAGE_ORDER, STAGE_LABELS, formatAmountMajor } from "@/lib/crm";
import { createOpportunity } from "./actions";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const [rows, accountRows] = await Promise.all([
    db.select().from(opportunities).orderBy(desc(opportunities.createdAt)).limit(500),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).orderBy(accounts.name).limit(500),
  ]);

  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));
  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, [] as typeof rows])) as Record<
    (typeof STAGE_ORDER)[number],
    typeof rows
  >;
  for (const row of rows) {
    const key = (STAGE_ORDER as readonly string[]).includes(row.stage)
      ? (row.stage as (typeof STAGE_ORDER)[number])
      : "new";
    byStage[key].push(row);
  }

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/dashboard" className="text-indigo-600 hover:underline">Dashboard</Link> / Opportunities
          </p>
          <h1 className="text-3xl font-bold mt-1">Opportunities</h1>
        </div>
        <a href="/api/auth/logout" className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline">Log out</a>
      </div>

      <section className="mb-10 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Create opportunity</h2>
        {accountRows.length === 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
            Create an{" "}
            <Link href="/accounts" className="font-medium text-indigo-600 hover:underline">account</Link>{" "}
            first, then add opportunities here.
          </p>
        ) : null}
        <form action={createOpportunity} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
            <input id="name" name="name" required className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="accountId" className="mb-1 block text-sm font-medium text-gray-700">Account *</label>
            <select id="accountId" name="accountId" required className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">Select account…</option>
              {accountRows.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="primaryContactId" className="mb-1 block text-sm font-medium text-gray-700">Primary contact ID (optional)</label>
            <input id="primaryContactId" name="primaryContactId" placeholder="uuid" className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="amount" className="mb-1 block text-sm font-medium text-gray-700">Amount (GBP)</label>
            <input id="amount" name="amount" type="number" step="0.01" min="0" placeholder="e.g. 1500.00" className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="closeDate" className="mb-1 block text-sm font-medium text-gray-700">Close date</label>
            <input id="closeDate" name="closeDate" type="date" className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="owner" className="mb-1 block text-sm font-medium text-gray-700">Owner</label>
            <input id="owner" name="owner" className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="stage" className="mb-1 block text-sm font-medium text-gray-700">Stage</label>
            <select id="stage" name="stage" defaultValue="new" className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500">Create opportunity</button>
          </div>
        </form>
      </section>

      <div className="space-y-6">
        {STAGE_ORDER.map((stage) => (
          <section key={stage} className="rounded-lg border bg-white overflow-hidden">
            <div className="px-6 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="text-base font-semibold">{STAGE_LABELS[stage]}</h2>
              <span className="text-sm text-gray-500">{byStage[stage].length}</span>
            </div>
            {byStage[stage].length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-400">None</p>
            ) : (
              <ul className="divide-y">
                {byStage[stage].map((o) => (
                  <li key={o.id} className="px-6 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-gray-50">
                    <div>
                      <Link href={`/opportunities/${o.id}`} className="font-medium text-indigo-600 hover:underline">{o.name}</Link>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {accountName.get(o.accountId) || o.accountId}
                        {o.owner ? ` · ${o.owner}` : ""}
                      </p>
                    </div>
                    <div className="text-sm font-medium text-gray-800">
                      {formatAmountMajor(o.amount, o.currency || "GBP")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}