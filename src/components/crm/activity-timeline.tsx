import Link from "next/link";
import {
  ACTIVITY_LABELS,
  isActivityType,
} from "@/lib/crm";

export type TimelineActivity = {
  id: string;
  contactId: string;
  type: string;
  subject: string | null;
  body: string | null;
  performedBy: string | null;
  performedAt: Date | string | null;
};

type Props = {
  activities: TimelineActivity[];
  /** Optional map contactId -> display label (shows contact chip/link) */
  contactLabels?: Record<string, string>;
  emptyMessage?: string;
  subtitle?: string;
  title?: string;
  /** Max chars for body snippet (default 160) */
  snippetLength?: number;
};

function formatWhen(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/London",
    }).format(new Date(d));
  } catch {
    return String(d);
  }
}

function snippet(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + "…";
}

export function ActivityTimeline({
  activities,
  contactLabels,
  emptyMessage = "No activities yet.",
  subtitle,
  title = "Activity timeline",
  snippetLength = 160,
}: Props) {
  return (
    <section className="rounded-lg border bg-white overflow-hidden">
      <div className="px-6 py-4 border-b">
        <h2 className="text-lg font-semibold">
          {title} ({activities.length})
        </h2>
        {subtitle ? (
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        ) : null}
      </div>
      {activities.length === 0 ? (
        <p className="p-6 text-gray-500">{emptyMessage}</p>
      ) : (
        <ul className="divide-y">
          {activities.map((a) => {
            const bodySnippet = snippet(a.body, snippetLength);
            const label = contactLabels?.[a.contactId];
            return (
              <li key={a.id} className="px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                      {isActivityType(a.type) ? ACTIVITY_LABELS[a.type] : a.type}
                    </span>
                    {label ? (
                      <Link
                        href={`/contacts/${a.contactId}`}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        {label}
                      </Link>
                    ) : null}
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatWhen(a.performedAt)}
                  </span>
                </div>
                {a.subject ? (
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {a.subject}
                  </p>
                ) : null}
                {bodySnippet ? (
                  <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
                    {bodySnippet}
                  </p>
                ) : null}
                {a.performedBy ? (
                  <p className="mt-1 text-xs text-gray-400">
                    by {a.performedBy}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
