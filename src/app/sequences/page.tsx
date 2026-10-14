import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { sequences, sequenceSteps, sequenceEnrollments } from "@/db/schema";
import { isDripSendingEnabled } from "@/lib/killSwitch";

export const dynamic = "force-dynamic";

// Read-only: lists sequences with step and enrolment counts. No send actions.
export default async function SequencesPage() {
  const dripOn = isDripSendingEnabled(process.env);
  const rows = await db.select().from(sequences).orderBy(desc(sequences.createdAt)).limit(200);
  const steps = await db
    .select({ id: sequenceSteps.sequenceId, n: sql<number>`count(*)::int` })
    .from(sequenceSteps)
    .groupBy(sequenceSteps.sequenceId);
  const enr = await db
    .select({ id: sequenceEnrollments.sequenceId, status: sequenceEnrollments.status, n: sql<number>`count(*)::int` })
    .from(sequenceEnrollments)
    .groupBy(sequenceEnrollments.sequenceId, sequenceEnrollments.status);
  const stepN = new Map(steps.map((s) => [s.id, s.n]));
  const enrBy = (id: string, st: string) => enr.filter((e) => e.id === id && (st === "*" || e.status === st)).reduce((a, e) => a + e.n, 0);

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/dashboard" className="text-indigo-600 hover:underline">Dashboard</Link> / Sequences
          </p>
          <h1 className="text-3xl font-bold mt-1">Sequences</h1>
        </div>
        <a href="/api/auth/logout" className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline">Log out</a>
      </div>
      <p className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Read-only view. Email sending is {dripOn ? "ENABLED" : "disabled"} (DRIP_SENDING_ENABLED). Nothing on this page sends email.
      </p>
      <section className="rounded-lg border bg-white overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">All sequences</h2>
          <span className="text-sm text-gray-500">{rows.length} shown</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-gray-500">No sequences yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Trigger</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Steps</th>
                  <th className="px-6 py-3 font-medium">Active enrolments</th>
                  <th className="px-6 py-3 font-medium">Completed</th>
                  <th className="px-6 py-3 font-medium">Total enrolments</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">{s.name}</td>
                    <td className="px-6 py-3 text-gray-600">{s.triggerEvent}</td>
                    <td className="px-6 py-3 text-gray-600">{s.active ? "Active" : "Inactive"}</td>
                    <td className="px-6 py-3 text-gray-600">{stepN.get(s.id) ?? 0}</td>
                    <td className="px-6 py-3 text-gray-600">{enrBy(s.id, "active")}</td>
                    <td className="px-6 py-3 text-gray-600">{enrBy(s.id, "completed")}</td>
                    <td className="px-6 py-3 text-gray-600">{enrBy(s.id, "*")}</td>
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