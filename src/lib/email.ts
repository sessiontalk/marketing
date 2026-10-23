import { SESv2Client, SendEmailCommand, type SendEmailCommandInput } from "@aws-sdk/client-sesv2";

// Lazy: created on first send, so importing this module (tests, build) needs no AWS env.
let _ses: SESv2Client | undefined;
function sesClient(): SESv2Client {
  if (!_ses) {
    _ses = new SESv2Client({
      region: process.env.AWS_SES_REGION || "eu-west-2",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _ses;
}

export const FROM_EMAIL = "SessionTalk <hello@sessiontalk.co.uk>";
export const REPLY_TO = "support@sessiontalk.co.uk";

export interface SendEmailParams {
  to: string;
  subject: string;
  html?: string; // omit for plain-text-only mail
  text?: string;
  unsubscribeUrl?: string;
  tags?: Record<string, string>;
  from?: string;
  replyTo?: string;
  bcc?: string[];
  /** Extra message headers, e.g. listUnsubscribeHeaders(). Sent via Content.Simple.Headers. */
  headers?: Record<string, string>;
}

// Trial nurture sender: Maryam personally. Never sales@ or chief@.
export const NURTURE_FROM_EMAIL = "Maryam Fatima <maryam@sessiontalk.co.uk>";
export const NURTURE_REPLY_TO = "maryam@sessiontalk.co.uk";

/**
 * mailto in every List-Unsubscribe header we set. Lands in the support@ mailbox; those requests are
 * NOT recorded automatically: support adds them with scripts/suppress-emails.ts (see README).
 * Reply-To is separate (nurture replies still go to Maryam).
 */
export const LIST_UNSUBSCRIBE_MAILTO = "support@sessiontalk.co.uk";

// Newsletter / broadcast sender (never hello@, never a personal address).
export const NEWSLETTER_FROM_EMAIL = "SessionTalk <support@sessiontalk.co.uk>";
export const NEWSLETTER_REPLY_TO = "support@sessiontalk.co.uk";

/** Build the SESv2 SendEmail input. Pure (no network) so header handling is unit-testable. */
export function buildSendEmailInput({
  to,
  subject,
  html,
  text,
  unsubscribeUrl,
  tags,
  from,
  replyTo,
  bcc,
  headers,
}: SendEmailParams): SendEmailCommandInput {
  const headerList = Object.entries(headers || {}).map(([Name, Value]) => {
    if (!/^[A-Za-z0-9-]+$/.test(Name)) throw new Error(`invalid header name: ${Name}`);
    if (/[\r\n]/.test(Value)) throw new Error(`invalid header value for ${Name}`);
    return { Name, Value };
  });
  // ListManagementOptions makes SES add its own List-Unsubscribe headers; never send both.
  if (unsubscribeUrl && headerList.some((h) => /^list-unsubscribe(-post)?$/i.test(h.Name)))
    throw new Error("pass either unsubscribeUrl (SES list management) or List-Unsubscribe headers, not both");
  return {
    FromEmailAddress: from || FROM_EMAIL,
    ReplyToAddresses: [replyTo || REPLY_TO],
    Destination: {
      ToAddresses: [to],
      ...(bcc && bcc.length ? { BccAddresses: bcc } : {}),
    },
    Content: {
      Simple: {
        Subject: { Data: subject },
        Body: {
          ...(html ? { Html: { Data: html } } : {}),
          ...(text ? { Text: { Data: text } } : {}),
        },
        ...(headerList.length ? { Headers: headerList } : {}),
      },
    },
    ...(unsubscribeUrl
      ? {
          ListManagementOptions: {
            ContactListName: "sessiontalk-contacts",
            TopicName: "marketing",
          },
        }
      : {}),
    EmailTags: tags
      ? Object.entries(tags).map(([Name, Value]) => ({ Name, Value }))
      : undefined,
  };
}

export async function sendEmail(params: SendEmailParams) {
  const result = await sesClient().send(new SendEmailCommand(buildSendEmailInput(params)));
  return { id: result.MessageId };
}
