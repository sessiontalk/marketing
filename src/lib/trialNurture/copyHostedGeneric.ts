// DRAFT copy for the hosted_pbx and generic_softphone sequences, pending Nauman's approval.
// final=false: the worker HOLDS these steps (never sends, never claims) until flipped to true.
// Source: /workspace/nurture-hosted-generic-20261031/nurture-hosted-generic-copy.md
import type { NurtureCopy } from "./copy";
export const HOSTED_PBX_COPY: NurtureCopy[] = [
  {
    "step": 1,
    "file": "01-first-extension-1h.md",
    "subject": "Your first extension takes about a minute",
    "body": "Hi {first_name},\n\nThanks for setting up your SessionPBX project. The next step is adding your first extension, which takes about a minute and gets you ready to make calls.\n\nYou can add one from your project in SessionCloud: https://cloud.sessiontalk.co.uk\n(If it asks you to sign in, sign in and then click the link again.)\n\nIf anything looks unclear, just reply and I'll help.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  },
  {
    "step": 2,
    "file": "02-test-call-day1.md",
    "subject": "Make your first test call",
    "body": "Hi {first_name},\n\nThe quickest way to get a feel for SessionPBX is to sign in on the softphone app with one of your extensions and make a test call to one of your teammates.\n\nYour login details were emailed when the extension was created. If you can't find them, you can resend the invite from your project: https://cloud.sessiontalk.co.uk\n(If it asks you to sign in, sign in and then click the link again.)\n\nOnce you hear it ring, you'll know the setup is working. Reply if you get stuck at any point.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  },
  {
    "step": 3,
    "file": "03-connect-trunk-day3.md",
    "subject": "Connect your SIP trunk so you can make real calls",
    "body": "Hi {first_name},\n\nTo make and take real calls, connect your own SIP trunk. SessionPBX works with the SIP carrier of your choice. We don't supply trunks or numbers, so you keep your existing carrier and your own rates.\n\nYou can add your trunk from your project: https://cloud.sessiontalk.co.uk\n(If it asks you to sign in, sign in and then click the link again.)\n\nIf you're not sure what details your carrier needs to give you, just ask.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  },
  {
    "step": 4,
    "file": "04-check-in-day7.md",
    "subject": "How's the trial going?",
    "body": "Hi {first_name},\n\nYou're a week into your SessionPBX trial, so I wanted to see how it's going.\n\nTwo things people often ask about at this point: you can put your own logo on the softphone apps your team uses, and other deployment options are available if hosting with us isn't the right fit.\n\nIf either is useful, or anything's unclear, just reply to this email.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  },
  {
    "step": 5,
    "file": "05-trial-ending.md",
    "subject": "Your SessionPBX trial ends in 2 days",
    "body": "Hi {first_name},\n\nYour SessionPBX trial ends in 2 days. To keep your extensions and settings, just add a card and pick a plan here: https://cloud.sessiontalk.co.uk/billing/{accountName}\n(If it asks you to sign in, sign in and then click the link again.)\n\nIf you'd like help choosing a plan, just reply.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  }
];
export const GENERIC_SOFTPHONE_COPY: NurtureCopy[] = [
  {
    "step": 1,
    "file": "01-first-user-1h.md",
    "subject": "Connect the softphone to your PBX",
    "body": "Hi {first_name},\n\nThanks for setting up your Generic Softphone project. The next step is adding your first user with the SIP extension details from your own phone system. It takes about a minute.\n\nYou can add users from your project in SessionCloud: https://cloud.sessiontalk.co.uk\n(If it asks you to sign in, sign in and then click the link again.)\n\nIf anything looks unclear, just reply and I'll help.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  },
  {
    "step": 2,
    "file": "02-sign-in-day1.md",
    "subject": "Sign in on the app and make a test call",
    "body": "Hi {first_name},\n\nOnce a user is added, sign in on the softphone app on a phone or computer and make a test call to another extension on your phone system.\n\nIf the app doesn't register, the usual cause is the SIP server address, port or transport not matching what your phone system expects. Reply with what you see and I'll help you work it out.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  },
  {
    "step": 3,
    "file": "03-app-logo-day3.md",
    "subject": "Put your own logo on the app",
    "body": "Hi {first_name},\n\nYour users can have the softphone with your own app logo branding, so it looks like part of your service rather than a third-party app.\n\nYou can set your logo and app details from your project: https://cloud.sessiontalk.co.uk\n(If it asks you to sign in, sign in and then click the link again.)\n\nIf you'd like a hand with the artwork sizes, just reply.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  },
  {
    "step": 4,
    "file": "04-check-in-day7.md",
    "subject": "How's the trial going?",
    "body": "Hi {first_name},\n\nYou're a week into your Generic Softphone trial, so I wanted to see how it's going.\n\nIf anything's unclear, or your phone system needs a setting you can't find, just reply to this email.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  },
  {
    "step": 5,
    "file": "05-trial-ending.md",
    "subject": "Your Generic Softphone trial ends in 2 days",
    "body": "Hi {first_name},\n\nYour Generic Softphone trial ends in 2 days. To keep your users and settings, just add a card here: https://cloud.sessiontalk.co.uk/billing/{accountName}\n(If it asks you to sign in, sign in and then click the link again.)\n\nThe plan is $50/month including 25 users, then $2/month for each extra user.\n\nIf you have any questions about it, just reply.\n\nMaryam\nSessionTalk\nmaryam@sessiontalk.co.uk",
    "final": false
  }
];
