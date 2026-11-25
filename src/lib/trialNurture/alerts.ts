/**
 * Trial-nurture alerts. There was no alert channel in this repo before (incident 17-25 Nov 2026
 * ran silent for 8 days), so:
 *  - every alert is ALWAYS a structured console.error line (level "alert"), visible in the app logs;
 *  - an alert EMAIL goes out only when NURTURE_ALERT_EMAIL_ENABLED === "true" (default OFF), to
 *    NURTURE_ALERT_TO (default naumansulaiman@googlemail.com; comma-separated list allowed),
 *    via the existing SES mailer, from support@ (never maryam@, never a customer).
 * Alert emails carry ids and counts only, never message bodies.
 */
import { sendEmail } from "@/lib/email";

export const DEFAULT_ALERT_TO = "naumansulaiman@googlemail.com";
export const ALERT_FROM_EMAIL = "SessionTalk CRM alerts <support@sessiontalk.co.uk>";

export type NurtureAlertKind = "send_failed" | "no_sends_24h" | "first_step_sla" | "worker_error";

export function alertEmailConfig(env: Record<string, string | undefined> = process.env): { enabled: boolean; to: string[] } {
  const to = (env.NURTURE_ALERT_TO || DEFAULT_ALERT_TO).split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
  return { enabled: env.NURTURE_ALERT_EMAIL_ENABLED === "true", to };
}

export function formatAlert(kind: NurtureAlertKind, summary: string, details: Record<string, unknown>): { subject: string; text: string } {
  return {
    subject: `[CRM nurture alert] ${kind}: ${summary}`.slice(0, 200),
    text: `${summary}\n\n${JSON.stringify(details, null, 2)}\n\nSource: marketing CRM /api/worker (trial-nurture). See README "Nurture alerts".`,
  };
}

/** Never throws: an alert must not break the worker. */
export async function nurtureAlert(
  kind: NurtureAlertKind,
  summary: string,
  details: Record<string, unknown> = {},
  deps: { env?: Record<string, string | undefined>; send?: typeof sendEmail; log?: (line: string) => void } = {},
): Promise<{ logged: true; emailed: boolean }> {
  const log = deps.log ?? ((l: string) => console.error(l));
  log(JSON.stringify({ level: "alert", msg: "trial_nurture_alert", kind, summary, ...details }));
  const cfg = alertEmailConfig(deps.env ?? process.env);
  if (!cfg.enabled || !cfg.to.length) return { logged: true, emailed: false };
  const { subject, text } = formatAlert(kind, summary, details);
  try {
    const send = deps.send ?? sendEmail;
    for (const to of cfg.to) await send({ to, subject, text, from: ALERT_FROM_EMAIL, tags: { alert: kind } });
    return { logged: true, emailed: true };
  } catch (err: any) {
    log(JSON.stringify({ level: "error", msg: "trial_nurture_alert_email_failed", kind, err: errorMessage(err) }));
    return { logged: true, emailed: false };
  }
}

/** Full error text for logs (name + message, capped), never a stack with env. */
export function errorMessage(err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  const s = e && (e.name || e.message) ? `${e.name || "Error"}: ${e.message || ""}` : String(err);
  return s.slice(0, 1000);
}
