// Generated from /workspace/sales/sessionpbx/nurture-sequence (Sales drafts, 2026-10-12). Plain text only.
// Step 3 is still being finalised by Sales: it is marked final:false and the sender refuses to send it.
export interface NurtureCopy { step: 1|2|3|4|5; file: string; subject: string; body: string; final: boolean }
export const NURTURE_COPY: NurtureCopy[] = [
  {
    "file": "01-no-extension-1h.md",
    "step": 1,
    "subject": "Your first extension takes about a minute",
    "body": "Hi {first_name},\n\nThanks for setting up your SessionPBX project. The next step is adding your first extension, which takes about a minute and gets you ready to make calls.\n\nYou can add one here: https://cloud.sessiontalk.io\n\nIf anything looks unclear, just reply and I'll help.\n\nMaryam Fatima\nSessionTalk\nsales@sessiontalk.co.uk",
    "final": true
  },
  {
    "file": "02-softphone-test-call-day1.md",
    "step": 2,
    "subject": "Make your first test call",
    "body": "Hi {first_name},\n\nThe quickest way to get a feel for SessionPBX is to sign in on the softphone with one of your extensions and make a test call.\n\nYour extension login details are in https://cloud.sessiontalk.io\n\nOnce you hear it ring, you'll know the setup is working. Reply if you get stuck at any point.\n\nMaryam Fatima\nSessionTalk\nsales@sessiontalk.co.uk",
    "final": true
  },
  {
    "file": "03-connect-carrier-day3.md",
    "step": 3,
    "subject": "Connect your carrier so you can make real calls",
    "body": "Hi {first_name},\n\nTo make and take real calls, connect your carrier or SIP trunk. You can bring any SIP carrier or trunk, and we don't add any markup to your minutes.\n\nYou can connect yours here: https://cloud.sessiontalk.io\n\nIf you're not sure which carrier to pick, just ask.\n\nMaryam Fatima\nSessionTalk\nsales@sessiontalk.co.uk",
    "final": false
  },
  {
    "file": "04-personal-help-day7.md",
    "step": 4,
    "subject": "How's the trial going?",
    "body": "Hi {first_name},\n\nYou're a week into your SessionPBX trial, so I wanted to see how it's going.\n\nIf you're coming from 3CX or Yeastar, SessionPBX gives you the same kind of setup without a server to run, and I'm happy to show you how your current setup would carry over.\n\nWould a quick 15-minute call help? Just reply with a time that suits you.\n\nMaryam Fatima\nSessionTalk\nsales@sessiontalk.co.uk",
    "final": true
  },
  {
    "file": "05-trial-ending.md",
    "step": 5,
    "subject": "Your SessionPBX trial ends in 2 days",
    "body": "Hi {first_name},\n\nYour SessionPBX trial ends in 2 days. To keep your extensions and settings, just add a card in https://cloud.sessiontalk.io\n\nTeams Phone is $20/month for 5 users (+$3 for each extra seat), and Teams Business is $40/month for 5 users (+$6 for each extra seat).\n\nIf you'd like help choosing a plan, just reply.\n\nMaryam Fatima\nSessionTalk\nsales@sessiontalk.co.uk",
    "final": true
  }
];
