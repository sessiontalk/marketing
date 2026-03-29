/**
 * Seeds the database with the welcome sequence and starter templates.
 * Run: npx tsx scripts/seed.ts
 */
import { db } from "../src/db";
import { templates, sequences, sequenceSteps } from "../src/db/schema";
import fs from "fs";
import path from "path";

async function seed() {
  console.log("🌱 Seeding database...");

  // 1. Create welcome email template
  const [welcomeTemplate] = await db
    .insert(templates)
    .values({
      name: "Welcome Email",
      subject: "Welcome to SessionTalk, {{firstname}}! 👋",
      htmlBody: getWelcomeHtml(),
      textBody: `Welcome to SessionTalk!

Thanks for signing up. Here's what you can do right now:
- Customise your branded mobile app
- Set up your desktop softphone
- Connect your SIP infrastructure

Get started: https://cloud.sessiontalk.co.uk

Cheers,
The SessionTalk Team`,
    })
    .returning();

  console.log(`  ✅ Created template: ${welcomeTemplate.name}`);

  // 2. Create getting started template
  const [gettingStartedTemplate] = await db
    .insert(templates)
    .values({
      name: "Getting Started Guide",
      subject: "3 things to do in your first week with SessionTalk",
      htmlBody: `<html><body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px;">
<h1>Getting started with SessionTalk 🚀</h1>
<p>Hi {{firstname}},</p>
<p>Here are 3 things to set up this week:</p>
<ol>
<li><strong>Add your SIP credentials</strong> — Connect your PBX or SIP trunk</li>
<li><strong>Customise your app</strong> — Add your logo, colours, and branding</li>
<li><strong>Invite your team</strong> — Add users and set up extensions</li>
</ol>
<p><a href="https://cloud.sessiontalk.co.uk" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Open Dashboard →</a></p>
<p>Cheers,<br/>The SessionTalk Team</p>
<hr/><p style="font-size: 12px; color: #999;"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</body></html>`,
      textBody: `Getting started with SessionTalk

Hi {{firstname}},

Here are 3 things to set up this week:
1. Add your SIP credentials
2. Customise your app branding
3. Invite your team

Open dashboard: https://cloud.sessiontalk.co.uk

Cheers,
The SessionTalk Team`,
    })
    .returning();

  console.log(`  ✅ Created template: ${gettingStartedTemplate.name}`);

  // 3. Create upgrade CTA template
  const [upgradeTemplate] = await db
    .insert(templates)
    .values({
      name: "Upgrade CTA",
      subject: "Ready to unlock more, {{firstname}}?",
      htmlBody: `<html><body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px;">
<h1>Ready for more? 🎯</h1>
<p>Hi {{firstname}},</p>
<p>You've been exploring SessionTalk — how's it going?</p>
<p>Our <strong>Whitelabel Mobile</strong> plan gives you:</p>
<ul>
<li>Your own branded app on iOS & Android</li>
<li>Up to 2,000 users</li>
<li>Push notifications & background calling</li>
<li>Custom SIP configuration per tenant</li>
</ul>
<p>Plans start at just <strong>$400/month</strong>.</p>
<p><a href="https://sessiontalk.co.uk/pricing" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Plans →</a></p>
<p>Cheers,<br/>The SessionTalk Team</p>
<hr/><p style="font-size: 12px; color: #999;"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</body></html>`,
      textBody: `Ready for more?

Hi {{firstname}},

Our Whitelabel Mobile plan gives you:
- Branded app on iOS & Android
- Up to 2,000 users
- Push notifications
- Custom SIP per tenant

Plans from $400/month. View: https://sessiontalk.co.uk/pricing`,
    })
    .returning();

  console.log(`  ✅ Created template: ${upgradeTemplate.name}`);

  // 4. Create welcome sequence
  const [welcomeSequence] = await db
    .insert(sequences)
    .values({
      name: "Welcome Drip",
      triggerEvent: "signup",
      active: true,
    })
    .returning();

  console.log(`  ✅ Created sequence: ${welcomeSequence.name}`);

  // 5. Create sequence steps
  const steps = [
    {
      sequenceId: welcomeSequence.id,
      stepOrder: 1,
      delayHours: 0, // Immediate
      templateId: welcomeTemplate.id,
    },
    {
      sequenceId: welcomeSequence.id,
      stepOrder: 2,
      delayHours: 48, // 2 days later
      templateId: gettingStartedTemplate.id,
    },
    {
      sequenceId: welcomeSequence.id,
      stepOrder: 3,
      delayHours: 120, // 5 days later
      templateId: upgradeTemplate.id,
    },
  ];

  for (const step of steps) {
    await db.insert(sequenceSteps).values(step);
    console.log(`  ✅ Created step ${step.stepOrder} (${step.delayHours}h delay)`);
  }

  console.log("\n🎉 Seed complete!");
  console.log(`   Sequence: "${welcomeSequence.name}" with ${steps.length} steps`);
}

function getWelcomeHtml(): string {
  try {
    // Try to read the compiled template, fallback to inline
    const templatePath = path.join(
      __dirname,
      "..",
      "src",
      "emails",
      "welcome.tsx"
    );
    // For now, return a good inline template
  } catch {}

  return `<html><body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px;">
<h1>Welcome, {{firstname}}! 👋</h1>
<p>Thanks for signing up for SessionTalk. You're one step closer to giving your customers a world-class softphone experience.</p>
<p>Here's what you can do right now:</p>
<ul>
<li>📱 Customise your branded mobile app</li>
<li>🖥️ Set up your desktop softphone</li>
<li>📞 Connect your SIP infrastructure</li>
</ul>
<p><a href="https://cloud.sessiontalk.co.uk" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Get Started →</a></p>
<p>If you have any questions, just reply to this email — we're here to help.</p>
<p>Cheers,<br/>The SessionTalk Team</p>
<hr/><p style="font-size: 12px; color: #999;"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</body></html>`;
}

seed().catch(console.error);
