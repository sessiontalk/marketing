import { sql } from "drizzle-orm";
import { db } from "../../db";

/** Newsletter report: sends/deliveries/bounces + unique REAL opens/clicks (is_bot excluded) + bot counts. */
export async function newsletterReport(campaign?: string) {
  const r = await db.execute(sql`
    select campaign,
      count(*) filter (where kind='send') sends,
      count(*) filter (where kind='delivery') deliveries,
      count(*) filter (where kind='bounce') bounces,
      count(*) filter (where kind='bounce' and bounce_type='Permanent') hard_bounces,
      count(*) filter (where kind='complaint') complaints,
      count(distinct recipient) filter (where kind='open' and is_bot is not true) real_unique_opens,
      count(distinct recipient) filter (where kind='click' and is_bot is not true) real_unique_clicks,
      count(*) filter (where kind='open' and is_bot) bot_opens,
      count(*) filter (where kind='click' and is_bot) bot_clicks
    from email_events where (${campaign ?? null}::text is null or campaign = ${campaign ?? null})
    group by campaign order by campaign`);
  return (r as any).rows ?? r;
}

/** Engaged contacts for Sales: real clicks first, then real opens; excludes do-not-contact. */
export async function engagedContacts(campaign?: string, limit = 500) {
  const r = await db.execute(sql`
    select c.id contact_id, c.email, c.firstname, c.lastname,
      count(*) filter (where e.kind='click') real_clicks,
      count(*) filter (where e.kind='open') real_opens,
      array_remove(array_agg(distinct e.link), null) links,
      max(e.occurred_at) last_engaged_at
    from email_events e join contacts c on c.id = e.contact_id
    where e.kind in ('open','click') and e.is_bot is not true and coalesce(c.unsubscribed,false) = false
      and (${campaign ?? null}::text is null or e.campaign = ${campaign ?? null})
    group by c.id order by real_clicks desc, real_opens desc, last_engaged_at desc limit ${limit}`);
  return (r as any).rows ?? r;
}
