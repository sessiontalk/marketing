"use client";

import { useState } from "react";

type Result = { imported?: number; skipped?: number; errors?: string[]; error?: string };

export default function ImportForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/import/csv", { method: "POST", body: new FormData(e.currentTarget) });
      const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Result;
      setResult(res.ok ? data : { error: data.error || `HTTP ${res.status}` });
    } catch {
      setResult({ error: "Upload failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm text-gray-700" />
      <button type="submit" disabled={busy} className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50">
        {busy ? "Importing..." : "Import CSV"}
      </button>
      {result && (
        result.error ? (
          <p className="text-sm text-red-600">{result.error}</p>
        ) : (
          <div className="text-sm text-gray-700">
            <p>Imported {result.imported ?? 0}, skipped {result.skipped ?? 0}.</p>
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-red-600">{result.errors.map((x, i) => <li key={i}>{x}</li>)}</ul>
            )}
          </div>
        )
      )}
    </form>
  );
}