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
  html: string;
  text?: string;
  unsubscribeUrl?: string;
  tags?: Record<string, string>;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  unsubscribeUrl,
  tags,
}: SendEmailParams) {
  const command = new SendEmailCommand({
    FromEmailAddress: FROM_EMAIL,
    ReplyToAddresses: [REPLY_TO],
    Destination: {
      ToAddresses: [to],
    },
    Content: {
      Simple: {
        Subject: { Data: subject },
        Body: {
          Html: { Data: html },
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
