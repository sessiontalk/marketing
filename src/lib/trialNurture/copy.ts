// Synced from /workspace/sales/sessionpbx/nurture-sequence (v2, 2026-10-12). Plain text only.
// Placeholders: {first_name} (fallback "there"), {sip_domain} (tenant .sip host as-is),
// {accountName} (billing only). Never build {slug}.{region}.sessiontalk.io (no .sip) — that
// wildcard resolves to cloudtest. Hold send if a required link field is missing.
export interface NurtureCopy { step: 1|2|3|4|5; file: string; subject: string; body: string; final: boolean }
export const NURTURE_COPY: NurtureCopy[] = [
  {
    "file": "01-no-extension-1h.md",
    "step": 1,
    "subject": "Your first extension takes about a minute",
    "body": "Hi {first_name},\n\nThanks for setting up your SessionPBX project. The next step is adding your first extension, which takes about a minute and gets you ready to make calls.\n\nYou can add one in Team Members: https://{sip_domain}/admin/team\n(If it asks you to sign in, sign in and then click the link again.)\n\nThe steps are here: https://docs.sessiontalk.io/docs/hosted-pbx/team-members/extensions\n\nIf anything looks unclear, just reply and I'll help.\n\nMaryam Fatima\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": true
  },
  {
    "file": "02-softphone-test-call-day1.md",
    "step": 2,
    "subject": "Make your first test call",
    "body": "Hi {first_name},\n\nThe quickest way to get a feel for SessionPBX is to sign in on the softphone with one of your extensions and make a test call.\n\nYour login details were emailed when the extension was created. If you can't find them, use Resend invite in Team Members: https://{sip_domain}/admin/team\n(If it asks you to sign in, sign in and then click the link again.)\n\nSetup guide for the apps: https://docs.sessiontalk.io/docs/hosted-pbx/team-members/install-apps\n\nOnce you hear it ring, you'll know the setup is working. Reply if you get stuck at any point.\n\nMaryam Fatima\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": true
  },
  {
    "file": "03-connect-carrier-day3.md",
    "step": 3,
    "subject": "Connect your carrier so you can make real calls",
    "body": "Hi {first_name},\n\nTo make and take real calls, connect your carrier or SIP trunk. You can bring any SIP carrier or trunk, and we don't add any markup to your minutes.\n\nYou can connect yours under Call Routing: https://{sip_domain}/admin/routing\n(If it asks you to sign in, sign in and then click the link again.)\n\nIf you're not sure which carrier to pick, just ask.\n\nMaryam Fatima\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": true
  },
  {
    "file": "04-personal-help-day7.md",
    "step": 4,
    "subject": "How's the trial going?",
    "body": "Hi {first_name},\n\nYou're a week into your SessionPBX trial, so I wanted to see how it's going.\n\nIf you're coming from 3CX or Yeastar, SessionPBX gives you the same kind of setup without a server to run, and I'm happy to show you how your current setup would carry over.\n\nWould a quick 15-minute call help? Just reply with a time that suits you.\n\nMaryam Fatima\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": true
  },
  {
    "file": "05-trial-ending.md",
    "step": 5,
    "subject": "Your SessionPBX trial ends in 2 days",
    "body": "Hi {first_name},\n\nYour SessionPBX trial ends in 2 days. To keep your extensions and settings, just add a card and pick a plan here: https://cloud.sessiontalk.io/billing/{accountName}\n(If it asks you to sign in, sign in and then click the link again.)\n\nTeams Phone is $20/month for 5 users (+$3 for each extra seat), and Teams Business is $40/month for 5 users (+$6 for each extra seat).\n\nIf you'd like help choosing a plan, just reply.\n\nMaryam Fatima\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": true
  }
];
