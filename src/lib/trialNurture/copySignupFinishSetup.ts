// Signup-time "finish setup" sequence for SessionCloud accounts that have not
// created a project yet. NO new marketing copy is invented here: each step is a
// clearly marked COPY_GAP for HoM. final=false => worker HOLDS (never sends).
//
// Why not reuse generic_softphone: that approved pack assumes an active softphone
// trial/project ("Thanks for starting your softphone trial", {workspace_url} CTAs).
// Why not Welcome Drip: RETIRED_SEQUENCE_NAMES includes "Welcome Drip".
import type { NurtureCopy } from "./copy";

export const SIGNUP_FINISH_SETUP_COPY: NurtureCopy[] = [
  {
    step: 1,
    file: "COPY_GAP-signup-01-create-project.md",
    subject: "[COPY_GAP] signup finish-setup step 1 subject",
    body:
      "[COPY_GAP: HoM — signup finish-setup step 1. Invite a brand-new SessionCloud account to create their first project. Must NOT assume a trial or project exists. Allowed static docs CTA only: https://docs.sessiontalk.io/docs/sessioncloud/creating-first-app. Forbidden project-derived placeholders: workspace_url, sip_domain, accountName, trial_ends_date.]\n\nMaryam Fatima\nSessionTalk\nmaryam@sessiontalk.co.uk",
    final: false,
  },
  {
    step: 2,
    file: "COPY_GAP-signup-02-nudge.md",
    subject: "[COPY_GAP] signup finish-setup step 2 subject",
    body:
      "[COPY_GAP: HoM — signup finish-setup step 2 (~day 2). Short nudge if they still have no project. Same constraints as step 1: no project-derived placeholders (workspace_url, sip_domain, accountName, trial_ends_date).]\n\nMaryam Fatima\nSessionTalk\nmaryam@sessiontalk.co.uk",
    final: false,
  },
];

/**
 * Upgrade mapping when trial.started arrives for a contact already on signup_finish_setup.
 * Signup steps are pre-trial; none map 1:1 onto product nurture steps.
 * - signup step 1 (create project) → superseded once project exists; do NOT mark product step 1 sent
 * - signup step 2 (nudge) → no product equivalent; ignore
 * Because signup steps are final=false (COPY_GAP), nothing is sent before upgrade in practice.
 * If a future approved signup step is sent, record it under the signup trial row only; the
 * product trial row starts with sentSteps=[] unless an explicit equivalence is added here.
 */
export const SIGNUP_TO_PRODUCT_STEP_MAP: Record<number, number | null> = {
  1: null,
  2: null,
};
