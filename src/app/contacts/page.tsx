import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, contacts } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const rows = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      firstname: contacts.firstname,
      lastname: contacts.lastname,
      phone: contacts.phone,
      country: contacts.country,
      accountId: contacts.accountId,
    })
    .from(contacts)
    .orderBy(desc(contacts.createdAt))
    .limit(200);

  const accountIds = [...new Set(rows.map((r) => r.accountId).filter(Boolean))] as string[];
  const accountRows =
    accountIds.length === 0
      ? []
      : await db
          .select({ id: accounts.id, name: accounts.name })
          .from(accounts)
          .where(inArray(accounts.id, accountIds));
  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/dashboard" className="text-indigo-600 hover:underline">Dashboard</Link> / Contacts
          </p>
          <h1 className="text-3xl font-bold mt-1">Contacts</h1>
        </div>
        <a href="/api/auth/logout" className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline">Log out</a>
      </div>

      <section className="rounded-lg border bg-white overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">All contacts</h2>
          <span className="text-sm text-gray-500">{rows.length} shown</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-gray-500">No contacts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Account</th>
                  <th className="px-6 py-3 font-medium">Phone</th>
                  <th className="px-6 py-3 font-medium">Country</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((c) => {
                  const name = [c.firstname, c.lastname].filter(Boolean).join(" ") || "—";
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">
                        <Link href={`/contacts/${c.id}`} className="text-indigo-600 hover:underline">{name}</Link>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{c.email}</td>
                      <td className="px-6 py-3 text-gray-600">
                        {c.accountId ? (
                          <Link href={`/accounts/${c.accountId}`} className="text-indigo-600 hover:underline">
                            {accountName.get(c.accountId) || "Account"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-600">{c.phone || "—"}</td>
                      <td className="px-6 py-3 text-gray-600">{c.country || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
