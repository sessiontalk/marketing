import { createHash } from "crypto";

/** Normalised SES event-publishing record (config set marketing-newsletter). */
export type EventKind = "send" | "delivery" | "open" | "click" | "bounce" | "complaint" | "unsubscribe" | "delivery_delay" | "reject" | "other";

export interface SesEvent {
  eventKey: string;          // sha256(messageId|kind|recipient|link|timestamp) — idempotency key
  sesMessageId: string;
  kind: EventKind;
  recipient: string;         // lower-cased bare address
  occurredAt: Date;
  campaign: string | null;
  variant: string | null;
  contactIdTag: string | null;
  link: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  sesBotHint: string | null; // SES isBotEvent ("Likely" | "Unlikely")
  bounceType: string | null;
  bounceSubType: string | null;
  subject: string | null;
}

const KIND: Record<string, EventKind> = {
  Send: "send", Delivery: "delivery", Open: "open", Click: "click", Bounce: "bounce",
  Complaint: "complaint", Subscription: "unsubscribe", DeliveryDelay: "delivery_delay", Reject: "reject",
};

export function bareEmail(s: string): string {
  const m = /<([^>]+)>/.exec(s);
  return (m ? m[1] : s).trim().toLowerCase();
}

const tag = (tags: any, k: string): string | null => (Array.isArray(tags?.[k]) && tags[k][0] != null ? String(tags[k][0]) : null);

export function eventKey(p: { sesMessageId: string; kind: string; recipient: string; link: string | null; occurredAt: Date }): string {
  return createHash("sha256").update([p.sesMessageId, p.kind, p.recipient, p.link ?? "", p.occurredAt.toISOString()].join("|")).digest("hex");
}

/** Unwrap an SQS body / SNS envelope / raw SES record into the raw SES record. */
export function unwrap(body: unknown): any | null {
  let x: any = body;
  for (let i = 0; i < 3; i++) {
    if (typeof x === "string") { try { x = JSON.parse(x); } catch { return null; } continue; }
    if (x && typeof x === "object" && x.Type === "Notification" && typeof x.Message === "string") { x = x.Message; continue; }
    break;
  }
  return x && typeof x === "object" && (x.eventType || x.notificationType) && x.mail ? x : null;
}

/** One SES record can fan out to several recipients (bounce/complaint). */
export function parseSesRecord(raw: any): SesEvent[] {
  if (!raw?.mail?.messageId) return [];
  const type = raw.eventType ?? raw.notificationType;
  const kind = KIND[type] ?? "other";
  const mail = raw.mail;
  const detail = raw[type === "Subscription" ? "subscription" : type === "DeliveryDelay" ? "deliveryDelay" : String(type).toLowerCase()] ?? {};
  const ts = new Date(detail.timestamp ?? mail.timestamp);
  let recipients: string[];
  if (kind === "bounce") recipients = (detail.bouncedRecipients ?? []).map((r: any) => r.emailAddress);
  else if (kind === "complaint") recipients = (detail.complainedRecipients ?? []).map((r: any) => r.emailAddress);
  else if (kind === "delivery") recipients = detail.recipients ?? mail.destination ?? [];
  else if (kind === "unsubscribe" && detail.contactList) recipients = mail.destination ?? [];
  else recipients = mail.destination ?? [];
  if (!recipients.length) recipients = mail.destination ?? [];
  const link = kind === "click" ? (detail.link ?? null) : null;
  return Array.from(new Set(recipients.map(bareEmail).filter(Boolean))).map((recipient) => {
    const base = { sesMessageId: String(mail.messageId), kind, recipient, link, occurredAt: ts };
    return {
      ...base,
      eventKey: eventKey(base),
      campaign: tag(mail.tags, "campaign"),
      variant: tag(mail.tags, "variant"),
      contactIdTag: tag(mail.tags, "contact_id"),
      userAgent: detail.userAgent ?? null,
      ipAddress: detail.ipAddress ?? null,
      sesBotHint: detail.isBotEvent ?? null,
      bounceType: kind === "bounce" ? (detail.bounceType ?? null) : null,
      bounceSubType: kind === "bounce" ? (detail.bounceSubType ?? null) : null,
      subject: mail.commonHeaders?.subject ?? null,
    };
  });
}

/** Events that set do-not-contact on the contact. Transient/Undetermined bounces do not. */
export function suppressionReason(e: Pick<SesEvent, "kind" | "bounceType">): string | null {
  if (e.kind === "complaint") return "ses_complaint";
  if (e.kind === "unsubscribe") return "ses_unsubscribe";
  if (e.kind === "bounce" && e.bounceType === "Permanent") return "ses_hard_bounce";
  return null;
}
