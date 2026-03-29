import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_EMAIL = "SessionTalk <hello@sessiontalk.co.uk>";
export const REPLY_TO = "support@sessiontalk.co.uk";
