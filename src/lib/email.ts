import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const sesClient = new SESv2Client({
  region: process.env.AWS_SES_REGION || "eu-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const FROM_EMAIL = "SessionTalk <hello@sessiontalk.co.uk>";
export const REPLY_TO = "support@sessiontalk.co.uk";

interface SendEmailParams {
  to: string;
  subject: string;
  html?: string; // omit for plain-text-only mail
  text?: string;
  unsubscribeUrl?: string;
  tags?: Record<string, string>;
  from?: string;
  replyTo?: string;
}

// Trial nurture sender: Maryam personally. Never sales@ or chief@.
export const NURTURE_FROM_EMAIL = "Maryam Fatima <maryam@sessiontalk.co.uk>";
export const NURTURE_REPLY_TO = "maryam@sessiontalk.co.uk";

export async function sendEmail({
  to,
  subject,
  html,
  text,
  unsubscribeUrl,
  tags,
  from,
  replyTo,
}: SendEmailParams) {
  const command = new SendEmailCommand({
    FromEmailAddress: from || FROM_EMAIL,
    ReplyToAddresses: [replyTo || REPLY_TO],
    Destination: {
      ToAddresses: [to],
    },
    Content: {
      Simple: {
        Subject: { Data: subject },
        Body: {
          ...(html ? { Html: { Data: html } } : {}),
          ...(text ? { Text: { Data: text } } : {}),
        },
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
  });

  const result = await sesClient.send(command);
  return { id: result.MessageId };
}
