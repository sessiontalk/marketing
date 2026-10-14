"use client";

import { useState } from "react";

const input = "w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function TestSequenceForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const to = String(f.get("to") || "");
    if (!confirm(`Send all 5 test emails to ${to}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/test-sequence", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, sipDomain: f.get("sipDomain"), accountName: f.get("accountName") || undefined, firstName: f.get("firstName") || undefined }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok && data.ok ? `Sent ${data.results.length} test emails.` : `Failed: ${data.error || JSON.stringify(data.results || res.status)}`);
    } catch { setMsg("Failed to send"); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div><label className="mb-1 block text-sm font-medium text-gray-700">Send to (one address) *</label><input name="to" type="email" required className={input} /></div>
      <div><label className="mb-1 block text-sm font-medium text-gray-700">Sample sip_domain *</label><input name="sipDomain" required placeholder="slug.eu.sessiontalk.io" className={input} /></div>
      <div><label className="mb-1 block text-sm font-medium text-gray-700">Sample accountName</label><input name="accountName" className={input} /></div>
      <div><label className="mb-1 block text-sm font-medium text-gray-700">First name</label><input name="firstName" className={input} /></div>
      <div className="md:col-span-2">
        <button type="submit" disabled={busy} className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50">{busy ? "Sending..." : "Send test sequence"}</button>
        {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
      </div>
    </form>
  );
}