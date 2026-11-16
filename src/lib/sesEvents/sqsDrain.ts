import type { EventStore } from "./process";
import { processBatch } from "./process";

/** Minimal SQS port so the drain loop is testable without AWS. */
export interface QueuePort {
  receive(max: number): Promise<Array<{ receiptHandle: string; body: string }>>;
  deleteBatch(receiptHandles: string[]): Promise<void>;
}

/**
 * Drain up to maxBatches×10 messages. Messages are deleted ONLY after processBatch resolved
 * (DB writes succeeded). Unparseable bodies are left on the queue (visibility timeout → retry → DLQ if a redrive policy exists).
 * A store error aborts the loop with nothing deleted for that batch.
 */
export async function drain(q: QueuePort, store: EventStore, maxBatches = 20) {
  const tot = { received: 0, deleted: 0, inserted: 0, unparseable: 0, suppressed: 0, activities: 0, bots: 0, batches: 0 };
  for (let i = 0; i < maxBatches; i++) {
    const msgs = await q.receive(10);
    if (!msgs.length) break;
    tot.batches++; tot.received += msgs.length;
    const r = await processBatch(msgs.map((m) => m.body), store);
    const del = r.okIndexes.map((ix) => msgs[ix].receiptHandle);
    if (del.length) await q.deleteBatch(del);
    tot.deleted += del.length; tot.inserted += r.inserted; tot.unparseable += r.unparseable;
    tot.suppressed += r.suppressed; tot.activities += r.activities; tot.bots += r.bots;
  }
  return tot;
}
