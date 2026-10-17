"use client";

import { useState } from "react";

const input = "w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const STEPS = [1, 2, 3, 4, 5];

export default function TestSequenceForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const to = String(f.get("to") || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    const steps = STEPS.filter((s) => f.get(`step${s}`) === "on");
    const productionSubject = f.get("productionSubject") === "on";
    if (!to.length) { setMsg("Enter at least one address."); return; }
    if (!steps.length) { setMsg("Pick at least one email."); return; }
    const total = to.length * steps.length;
    if (!confirm(`Send ${total} test email${total === 1 ? "" : "s"} (email ${steps.join(", ")}) to ${to.join(", ")}${productionSubject ? " with production subjects (no [TEST] prefix)" : ""}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/test-sequence", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, steps, productionSubject, sipDomain: f.get("sipDomain"), accountName: f.get("accountName") || undefined, firstName: f.get("firstName") || undefined }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok && data.ok ? `Sent ${data.results.length} test emails.` : `Failed: ${data.error || JSON.stringify(data.results || res.status)}`);
    } catch { setMsg("Failed to send"); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-gray-700">Send to (up to 10 addresses, comma or newline separated) *</label><textarea name="to" required rows={2} className={input} /></div>
      <div><label className="mb-1 block text-sm font-medium text-gray-700">Sample sip_domain *</label><input name="sipDomain" required placeholder="slug.eu.sessiontalk.io" className={input} /></div>
      <div><label className="mb-1 block text-sm font-medium text-gray-700">Sample accountName</label><input name="accountName" className={input} /></div>
      <div><label className="mb-1 block text-sm font-medium text-gray-700">First name</label><input name="firstName" className={input} /></div>
      <fieldset className="md:col-span-2">
        <legend className="mb-1 block text-sm font-medium text-gray-700">Emails to send</legend>
        <div className="flex flex-wrap gap-4">
          {STEPS.map((s) => (
            <label key={s} className="inline-flex items-center gap-1 text-sm"><input type="checkbox" name={`step${s}`} defaultChecked /> Email {s}</label>
          ))}
        </div>
      </fieldset>
      <label className="md:col-span-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" name="productionSubject" /> Use production subject (no [TEST n/5] prefix), for inbox-placement tests</label>
      <div className="md:col-span-2">
        <button type="submit" disabled={busy} className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50">{busy ? "Sending..." : "Send test sequence"}</button>
        {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
      </div>
    </form>
  );
}
