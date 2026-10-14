import Link from "next/link";
import ImportForm from "./import-form";

// CSV import of contacts. Posts to /api/import/csv (cookie-auth via middleware).
// Importing contacts does not enrol them in sequences or send email.
export default function ImportPage() {
  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/dashboard" className="text-indigo-600 hover:underline">Dashboard</Link> / Import CSV
          </p>
          <h1 className="text-3xl font-bold mt-1">Import CSV</h1>
        </div>
        <a href="/api/auth/logout" className="text-sm font-medium text-gray-600 hover:text-indigo-600 underline-offset-2 hover:underline">Log out</a>
      </div>
      <section className="rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-2">Upload contacts CSV</h2>
        <p className="mb-4 text-sm text-gray-500">Columns: email (required), firstname, lastname, phone, website, country. Existing emails are skipped. No emails are sent.</p>
        <ImportForm />
      </section>
    </main>
  );
}