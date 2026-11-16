import { SQSClient, ReceiveMessageCommand, DeleteMessageBatchCommand } from "@aws-sdk/client-sqs";
import type { QueuePort } from "./sqsDrain";

export function awsQueue(queueUrl: string, region = process.env.SES_EVENTS_QUEUE_REGION || "eu-west-2"): QueuePort {
  const c = new SQSClient({ region });
  return {
    async receive(max) {
      const r = await c.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: max, WaitTimeSeconds: 0, VisibilityTimeout: 120 }));
      return (r.Messages ?? []).map((m) => ({ receiptHandle: m.ReceiptHandle!, body: m.Body ?? "" }));
    },
    async deleteBatch(handles) {
      for (let i = 0; i < handles.length; i += 10) {
        const r = await c.send(new DeleteMessageBatchCommand({ QueueUrl: queueUrl, Entries: handles.slice(i, i + 10).map((h, j) => ({ Id: String(j), ReceiptHandle: h })) }));
        if (r.Failed?.length) console.log(JSON.stringify({ level: "warn", msg: "ses_events_delete_failed", n: r.Failed.length }));
      }
    },
  };
}
