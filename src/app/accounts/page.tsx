import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { createAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const rows = await db.select().from(accounts).orderBy(desc(accounts.createdAt)).limit(200);

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/dashboard" className="text-indigo-600 hover:underline">Dashboard</Link> / Accounts
          </p>
          <h1 className="text-3xl font-bold mt-1">Accounts</h1>
        </div>
        <a href="/api/auth/logout" className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline">Log out</a>
      </div>

      <section className="mb-10 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Create account</h2>
        <form action={createAccount} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
            <input id="name" name="name" required className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="website" className="mb-1 block text-sm font-medium text-gray-700">Website</label>
            <input id="website" name="website" className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="country" className="mb-1 block text-sm font-medium text-gray-700">Country</label>
            <input id="country" name="country" maxLength={5} placeholder="GB" className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
            <input id="phone" name="phone" className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="owner" className="mb-1 block text-sm font-medium text-gray-700">Owner</label>
            <input id="owner" name="owner" className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea id="notes" name="notes" rows={3} className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500">Create account</button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-white overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">All accounts</h2>
          <span className="text-sm text-gray-500">{rows.length} shown</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-gray-500">No accounts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Country</th>
                  <th className="px-6 py-3 font-medium">Owner</th>
                  <th className="px-6 py-3 font-medium">Website</th>
                  <th className="px-6 py-3 font-medium">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">
                      <Link href={`/accounts/${a.id}`} className="text-indigo-600 hover:underline">{a.name}</Link>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{a.country || "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{a.owner || "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{a.website || "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{a.phone || "—"}</td>
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