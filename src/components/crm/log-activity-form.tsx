import { logActivity } from "@/app/activities/actions";
import { ACTIVITY_LABELS, ACTIVITY_TYPES } from "@/lib/crm";

export type ContactOption = {
  id: string;
  label: string;
};

type Props = {
  /** Hidden contactId when logging against a known contact */
  contactId?: string;
  /** Contact picker when logging from account 360 */
  contacts?: ContactOption[];
  returnTo: string;
  /** Prefill performedBy (e.g. session username) */
  defaultPerformedBy?: string;
  hint?: string;
};

export function LogActivityForm({
  contactId,
  contacts,
  returnTo,
  defaultPerformedBy = "",
  hint,
}: Props) {
  const needsPicker = !contactId && (contacts?.length ?? 0) > 0;

  return (
    <section className="mb-8 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">Log activity</h2>
      {hint ? <p className="text-xs text-gray-500 mb-4">{hint}</p> : null}
      <form action={logActivity} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        {contactId ? (
          <input type="hidden" name="contactId" value={contactId} />
        ) : null}

        {needsPicker ? (
          <div>
            <label
              htmlFor="contactId"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Contact *
            </label>
            <select
              id="contactId"
              name="contactId"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select contact…</option>
              {contacts!.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label
            htmlFor="type"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Type *
          </label>
          <select
            id="type"
            name="type"
            required
            defaultValue="note"
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="performedBy"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Performed by
          </label>
          <input
            id="performedBy"
            name="performedBy"
            defaultValue={defaultPerformedBy}
            placeholder="Your name"
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className={needsPicker ? "" : "md:col-span-2"}>
          <label
            htmlFor="subject"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="body"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Body
          </label>
          <textarea
            id="body"
            name="body"
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500"
          >
            Log activity
          </button>
        </div>
      </form>
    </section>
  );
}
