import fs from "fs";
import { Pool } from "pg";

async function main() {
  const logPath = process.argv[2];
  if (!logPath) throw new Error("Usage: tsx scripts/sync-desktop-links-campaign.ts <sent-log.jsonl>");
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL missing; CRM sync skipped.");
    return;
  }

  // node-postgres (was the Neon HTTP driver). Same tagged-template call sites:
  // each ${...} becomes a $n bind parameter and the result is the rows array.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pool.query(text, values)).rows;
  };
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
  let contactsUpserted = 0;
  let logsInserted = 0;
  let logsSkipped = 0;

  for (const line of lines) {
    const send = JSON.parse(line);
    const email = String(send.email || "").toLowerCase().trim();
    if (!email) continue;
    const objectId = send.objectId || null;

    const contactRows = await sql`
      insert into contacts (object_id, email, username, source, updated_at)
      values (${objectId}, ${email}, ${email}, 'hermes_campaign', now())
      on conflict (email) do update set
        object_id = coalesce(contacts.object_id, excluded.object_id),
        source = coalesce(contacts.source, excluded.source),
        updated_at = now()
      returning id
    `;
    contactsUpserted++;
    const contactId = contactRows[0]?.id;
    if (!contactId) continue;

    const exists = await sql`select id from send_logs where resend_id = ${send.messageId} limit 1`;
    if (exists.length) {
      logsSkipped++;
      continue;
    }

    await sql`
      insert into send_logs (contact_id, resend_id, status, error_message, sent_at)
      values (
        ${contactId},
        ${send.messageId},
        'sent',
        ${JSON.stringify({
          source: 'hermes_campaign',
          campaign: send.campaign || '2026-06-desktop-links-paying-customers',
          segment: send.segment || 'existing_paying_customer_desktop_links_update',
          accountNames: send.accountNames || '',
        })},
        ${send.at ? new Date(send.at).toISOString() : new Date().toISOString()}
      )
    `;
    logsInserted++;
  }

  console.log(JSON.stringify({ logPath, sends: lines.length, contactsUpserted, logsInserted, logsSkipped }, null, 2));
  await pool.end();
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
