import { z } from "zod";

/** Events SessionCloud POSTs to /api/events/trial (HMAC-SHA256 hex of raw body in x-webhook-signature). */
export const TrialEvent = z.object({
  event: z.enum([
    "trial.started", "project.created", "extension.created", "softphone.login",
    "call.completed", "trunk.connected", "number.added", "card.added",
    "plan.changed", "trial.cancelled", "email.verified",
  ]),
  event_id: z.string().min(1),            // idempotency key from SessionCloud
  occurred_at: z.string().datetime(),
  email: z.string().email(),
  objectId: z.string().optional(),         // SessionCloud user objectId
  app_id: z.string().optional(),           // SessionCloud app/project id
  product: z.enum(["teams_phone", "teams_business", "hosted"]).optional(),
  firstname: z.string().optional(),
  trial_ends_at: z.string().datetime().optional(),
  extension_count: z.number().int().min(0).optional(),
  plan_status: z.enum(["trial", "paid", "cancelled"]).optional(),
});
export type TrialEvent = z.infer<typeof TrialEvent>;
