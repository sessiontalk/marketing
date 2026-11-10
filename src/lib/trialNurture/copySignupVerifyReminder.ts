/**
 * signup_verify_reminder — one email, ~24h after signup if still unverified.
 * Copy: /workspace/marketing/drips/signup-verify-reminder/2026-11-10-DRAFT.md
 * Status: APPROVED by Nauman 10 Nov 2026 08:25 GMT. Loaded final=true; do not
 * merge/deploy/send until the SessionCloud confirm-email path is also live.
 *
 * Verbatim subject, preheader, body prose, CTA label, plain-text CTA line, and
 * sign-off from that file. {{verify_url}} is minted at send time (HMAC confirm
 * link; SessionCloud issues a fresh confirmation — never a raw verify token).
 * Sender: Maryam <maryam@sessiontalk.co.uk> (SIGNUP_NURTURE_FROM_EMAIL).
 * Fallback: empty {first_name} → "Hi there," (existing render()).
 */
import type { NurtureCopy } from "./copy";

export const SIGNUP_VERIFY_REMINDER_DRAFT_PATH =
  "/workspace/marketing/drips/signup-verify-reminder/2026-11-10-DRAFT.md";

export const SIGNUP_VERIFY_REMINDER_COPY: NurtureCopy[] = [
  {
    step: 1,
    file: "2026-11-10-DRAFT.md",
    subject: "Please confirm your email to finish signing up",
    preheader: "One tap and your SessionTalk account is ready to use.",
    ctaLabel: "Confirm my email",
    body: "Hi {first_name},\n\nThanks for signing up to SessionTalk. Yesterday we sent you an email to confirm your address, and it looks like it hasn't been confirmed yet.\n\nIt might be sitting in your spam or promotions folder, or the link may have expired. Either way, the button below sorts it out.\n\nConfirm your email: {{verify_url}}\n\nOnce your email is confirmed, you can sign in at cloud.sessiontalk.io and create your first project.\n\nIf the button doesn't work or something else got in the way, just reply to this email and I'll help.\n\nThanks,\nMaryam\nSessionTalk",
    html: "<div style=\"display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;\">One tap and your SessionTalk account is ready to use.</div><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Hi {first_name},</p><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Thanks for signing up to SessionTalk. Yesterday we sent you an email to confirm your address, and it looks like it hasn't been confirmed yet.</p><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">It might be sitting in your spam or promotions folder, or the link may have expired. Either way, the button below sorts it out.</p><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:4px 0 18px 0;\"><tr><td align=\"center\" bgcolor=\"#5B59A2\" style=\"border-radius:6px;background:#5B59A2;\"><!--[if mso]><v:roundrect xmlns:v=\"urn:schemas-microsoft-com:vml\" href=\"{{verify_url}}\" style=\"height:44px;v-text-anchor:middle;width:240px;\" arcsize=\"14%\" stroke=\"f\" fillcolor=\"#5B59A2\"><center style=\"color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;\">Confirm my email</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href=\"{{verify_url}}\" target=\"_blank\" style=\"display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;background:#5B59A2;\">Confirm my email</a><!--<![endif]--></td></tr></table><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Once your email is confirmed, you can sign in at cloud.sessiontalk.io and create your first project.</p><p style=\"margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">If the button doesn't work or something else got in the way, just reply to this email and I'll help.</p><p style=\"margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1e293b;\">Thanks,<br>Maryam<br><span style=\"color:#64748b;\">SessionTalk</span></p>",
    final: true,
  },
];
