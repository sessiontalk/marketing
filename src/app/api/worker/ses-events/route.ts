import { NextRequest, NextResponse } from "next/server";
import { drain } from "@/lib/sesEvents/sqsDrain";
import { awsQueue } from "@/lib/sesEvents/sqsAws";
import { dbEventStore } from "@/lib/sesEvents/store";

export const maxDuration = 60;

/** Vercel cron: drain SQS (SES marketing-newsletter events) into email_events + activities. Off unless SES_EVENTS_CONSUMER_ENABLED=true. */
async function run(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.SES_EVENTS_CONSUMER_ENABLED !== "true") return NextResponse.json({ enabled: false });
  const url = process.env.SES_EVENTS_QUEUE_URL;
  if (!url) return NextResponse.json({ error: "SES_EVENTS_QUEUE_URL not set" }, { status: 500 });
  try {
    const r = await drain(awsQueue(url), dbEventStore, Number(process.env.SES_EVENTS_MAX_BATCHES || 20));
    console.log(JSON.stringify({ level: "info", msg: "ses_events_drain", ...r }));
    return NextResponse.json({ enabled: true, ...r });
  } catch (e: any) {
    console.log(JSON.stringify({ level: "error", msg: "ses_events_drain_failed", err: String(e?.message ?? e).slice(0, 300) }));
    return NextResponse.json({ error: "drain failed" }, { status: 500 });
  }
}
export const GET = run;
export const POST = run;
