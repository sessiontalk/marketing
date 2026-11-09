/**
 * signup_finish_setup — HoM draft /workspace/marketing/drips/signup-finish-setup/2026-11-09-DRAFT.md
 * Status in draft file: awaiting Nauman exact-text approval. Loaded final=true so the worker
 * can send once approved/merged; do not deploy until Nauman yes.
 *
 * Verbatim subjects/preheaders/CTA labels/body prose from that file. CTA URL (both):
 * https://docs.sessiontalk.io/docs/sessioncloud/creating-first-app
 * Sender: Maryam <maryam@sessiontalk.co.uk> (SIGNUP_NURTURE_FROM_EMAIL). Softphone HTML shell.
 * Text body keeps the draft [CTA label] line, then the docs URL on the next line for clients.
 */
import type { NurtureCopy } from "./copy";

export const SIGNUP_FINISH_SETUP_CTA_URL = "https://docs.sessiontalk.io/docs/sessioncloud/creating-first-app";
export const SIGNUP_FINISH_SETUP_DRAFT_PATH =
  "/workspace/marketing/drips/signup-finish-setup/2026-11-09-DRAFT.md";

export const SIGNUP_FINISH_SETUP_COPY: NurtureCopy[] = [
  {
    step: 1,
    file: "2026-11-09-DRAFT.md#email-1",
    subject: "Welcome to SessionTalk, let's set up your first project",
    preheader: "One short step and you're ready to start making calls.",
    ctaLabel: "Create your first project",
    body: "Hi {first_name},\n\nWelcome to SessionTalk, and thanks for signing up.\n\nYour account is ready. Next, create your first project. A project is where you set up whatever you're building with us, whether that's a hosted phone system for your team or softphone apps for the SIP PBX you already run.\n\nIt only takes a few minutes:\n1. Sign in at cloud.sessiontalk.io.\n2. Create a project and choose the product that fits.\n3. Follow the setup steps. Our guide walks you through each one.\n\n[Create your first project]\nhttps://docs.sessiontalk.io/docs/sessioncloud/creating-first-app\n\nNot sure which product is right for you? Just reply to this email and tell me what you're trying to do. I'll point you in the right direction.\n\nThanks,\nMaryam\nSessionTalk",
    html: "<div style=\"display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;\">One short step and you're ready to start making calls.</div><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Hi {first_name},</p><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Welcome to SessionTalk, and thanks for signing up.</p><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Your account is ready. Next, create your first project. A project is where you set up whatever you're building with us, whether that's a hosted phone system for your team or softphone apps for the SIP PBX you already run.</p><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">It only takes a few minutes:</p><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">1. Sign in at cloud.sessiontalk.io.<br>2. Create a project and choose the product that fits.<br>3. Follow the setup steps. Our guide walks you through each one.</p><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:4px 0 18px 0;\"><tr><td align=\"center\" bgcolor=\"#5B59A2\" style=\"border-radius:6px;background:#5B59A2;\"><!--[if mso]><v:roundrect xmlns:v=\"urn:schemas-microsoft-com:vml\" href=\"https://docs.sessiontalk.io/docs/sessioncloud/creating-first-app\" style=\"height:44px;v-text-anchor:middle;width:300px;\" arcsize=\"14%\" stroke=\"f\" fillcolor=\"#5B59A2\"><center style=\"color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;\">Create your first project</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href=\"https://docs.sessiontalk.io/docs/sessioncloud/creating-first-app\" target=\"_blank\" style=\"display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;background:#5B59A2;\">Create your first project</a><!--<![endif]--></td></tr></table><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Not sure which product is right for you? Just reply to this email and tell me what you're trying to do. I'll point you in the right direction.</p><p style=\"margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Thanks,<br>Maryam<br><span style=\"color:#64748b;\">SessionTalk</span></p>",
    final: true,
  },
  {
    step: 2,
    file: "2026-11-09-DRAFT.md#email-2",
    subject: "Your SessionTalk account is ready when you are",
    preheader: "Creating your first project only takes a few minutes. Here's the guide.",
    ctaLabel: "See how to create a project",
    body: "Hi {first_name},\n\nI noticed you haven't created a project yet, so here's a quick reminder in case it slipped down the list.\n\nCreating your first project is the step that gets you going. Sign in at cloud.sessiontalk.io, create a project, choose your product and follow the setup. The guide below walks through it screen by screen.\n\n[See how to create a project]\nhttps://docs.sessiontalk.io/docs/sessioncloud/creating-first-app\n\nIf something got in the way, or you're not sure where to start, reply and let me know. I'm happy to help.\n\nThanks,\nMaryam\nSessionTalk",
    html: "<div style=\"display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;\">Creating your first project only takes a few minutes. Here's the guide.</div><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Hi {first_name},</p><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">I noticed you haven't created a project yet, so here's a quick reminder in case it slipped down the list.</p><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Creating your first project is the step that gets you going. Sign in at cloud.sessiontalk.io, create a project, choose your product and follow the setup. The guide below walks through it screen by screen.</p><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:4px 0 18px 0;\"><tr><td align=\"center\" bgcolor=\"#5B59A2\" style=\"border-radius:6px;background:#5B59A2;\"><!--[if mso]><v:roundrect xmlns:v=\"urn:schemas-microsoft-com:vml\" href=\"https://docs.sessiontalk.io/docs/sessioncloud/creating-first-app\" style=\"height:44px;v-text-anchor:middle;width:300px;\" arcsize=\"14%\" stroke=\"f\" fillcolor=\"#5B59A2\"><center style=\"color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;\">See how to create a project</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href=\"https://docs.sessiontalk.io/docs/sessioncloud/creating-first-app\" target=\"_blank\" style=\"display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;background:#5B59A2;\">See how to create a project</a><!--<![endif]--></td></tr></table><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">If something got in the way, or you're not sure where to start, reply and let me know. I'm happy to help.</p><p style=\"margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Thanks,<br>Maryam<br><span style=\"color:#64748b;\">SessionTalk</span></p>",
    final: true,
  },
];

/**
 * Upgrade mapping when trial.started arrives for a contact already on signup_finish_setup.
 * Signup steps are pre-trial; none map 1:1 onto product nurture steps.
 * - signup step 1 (create project) → superseded once project exists; do NOT mark product step 1 sent
 * - signup step 2 (nudge) → no product equivalent; ignore (skip if project already present)
 * Product trial row starts with sentSteps=[] unless an explicit equivalence is added here.
 */
export const SIGNUP_TO_PRODUCT_STEP_MAP: Record<number, number | null> = {
  1: null,
  2: null,
};
