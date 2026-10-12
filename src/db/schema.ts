import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Contacts ───────────────────────────────────────────────────────

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    objectId: varchar("object_id", { length: 20 }).unique(), // from Parse/cloud
    email: varchar("email", { length: 255 }).notNull().unique(),
    username: varchar("username", { length: 255 }),
    firstname: varchar("firstname", { length: 255 }),
    lastname: varchar("lastname", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    website: varchar("website", { length: 255 }),
    country: varchar("country", { length: 5 }),
    emailVerified: boolean("email_verified").default(false),
    source: varchar("source", { length: 50 }).default("csv_import"), // csv_import | webhook
    unsubscribed: boolean("unsubscribed").default(false),
    unsubscribedAt: timestamp("unsubscribed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    originalCreatedAt: timestamp("original_created_at"), // from cloud.sessiontalk.co.uk
  },
  (t) => ({
    emailIdx: index("contacts_email_idx").on(t.email),
    countryIdx: index("contacts_country_idx").on(t.country),
    sourceIdx: index("contacts_source_idx").on(t.source),
  })
);

// ─── Templates ──────────────────────────────────────────────────────

export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Campaigns (one-off newsletters) ────────────────────────────────

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  templateId: uuid("template_id").references(() => templates.id),
  status: varchar("status", { length: 30 }).default("draft"), // draft | scheduled | sending | sent | cancelled
  filterJson: jsonb("filter_json"), // segment filter: { countries: ["GB","US"], signedUpAfter: "2024-01-01" }
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  totalRecipients: integer("total_recipients").default(0),
  totalSent: integer("total_sent").default(0),
  totalFailed: integer("total_failed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Sequences (drip campaigns) ─────────────────────────────────────

export const sequences = pgTable("sequences", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  triggerEvent: varchar("trigger_event", { length: 50 }).notNull(), // signup | manual
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sequenceSteps = pgTable("sequence_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  sequenceId: uuid("sequence_id")
    .references(() => sequences.id)
    .notNull(),
  stepOrder: integer("step_order").notNull(),
  delayHours: integer("delay_hours").notNull().default(0), // hours after previous step (or enrollment for step 1)
  templateId: uuid("template_id").references(() => templates.id),
  subject: varchar("subject", { length: 500 }), // override template subject
  createdAt: timestamp("created_at").defaultNow(),
});

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contactId: uuid("contact_id")
      .references(() => contacts.id)
      .notNull(),
    sequenceId: uuid("sequence_id")
      .references(() => sequences.id)
      .notNull(),
    currentStepOrder: integer("current_step_order").default(0),
    status: varchar("status", { length: 30 }).default("active"), // active | completed | paused | cancelled
    enrolledAt: timestamp("enrolled_at").defaultNow(),
    nextSendAt: timestamp("next_send_at"),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    nextSendIdx: index("enrollments_next_send_idx").on(t.nextSendAt),
    contactSeqIdx: index("enrollments_contact_seq_idx").on(
      t.contactId,
      t.sequenceId
    ),
    // Idempotency: one live enrolment per contact per sequence (cancelled rows are history).
    contactSeqUniq: uniqueIndex("enrollments_contact_seq_live_uniq")
      .on(t.contactId, t.sequenceId)
      .where(sql`status <> 'cancelled'`),
  })
);

// ─── Send Logs ──────────────────────────────────────────────────────

export const sendLogs = pgTable(
  "send_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contactId: uuid("contact_id")
      .references(() => contacts.id)
      .notNull(),
    templateId: uuid("template_id").references(() => templates.id),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    enrollmentId: uuid("enrollment_id").references(() => sequenceEnrollments.id),
    resendId: varchar("resend_id", { length: 255 }),
    status: varchar("status", { length: 30 }).notNull(), // sent | failed | bounced | opened | clicked
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at").defaultNow(),
  },
  (t) => ({
    contactIdx: index("send_logs_contact_idx").on(t.contactId),
    campaignIdx: index("send_logs_campaign_idx").on(t.campaignId),
    enrollmentIdx: index("send_logs_enrollment_idx").on(t.enrollmentId),
  })
);

// ─── Unsubscribe Tokens ─────────────────────────────────────────────

export const unsubscribeTokens = pgTable("unsubscribe_tokens", {
  token: varchar("token", { length: 64 }).primaryKey(),
  contactId: uuid("contact_id")
    .references(() => contacts.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── SessionPBX trial nurture (activity-triggered) ─────────────────

export const trialAccounts = pgTable("trial_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  appId: varchar("app_id", { length: 64 }).notNull().unique(), // SessionCloud project/app id
  product: varchar("product", { length: 30 }).notNull(),
  accountName: varchar("account_name", { length: 128 }), // SessionCloud accountName for in-app links
  enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
  trialStartedAt: timestamp("trial_started_at").notNull(),
  trialEndsAt: timestamp("trial_ends_at"),
  projectCreatedAt: timestamp("project_created_at"),
  extensionCount: integer("extension_count").default(0).notNull(),
  softphoneFirstLoginAt: timestamp("softphone_first_login_at"),
  firstCallAt: timestamp("first_call_at"),
  carrierConnectedAt: timestamp("carrier_connected_at"),
  salesCallBookedAt: timestamp("sales_call_booked_at"),
  salesCallHeldAt: timestamp("sales_call_held_at"),
  lastInboundReplyAt: timestamp("last_inbound_reply_at"),
  paymentMethodAddedAt: timestamp("payment_method_added_at"),
  planStatus: varchar("plan_status", { length: 20 }).default("trial").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** One row per (trial, step): sent | skipped | failed. Unique => a step can never send twice. */
export const trialNurtureSteps = pgTable(
  "trial_nurture_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trialAccountId: uuid("trial_account_id").references(() => trialAccounts.id).notNull(),
    step: integer("step").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    reason: varchar("reason", { length: 64 }),
    sesMessageId: varchar("ses_message_id", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({ uniq: uniqueIndex("trial_nurture_steps_uniq").on(t.trialAccountId, t.step) })
);

/** Dedupe of inbound SessionCloud events. */
export const processedEvents = pgTable("processed_events", {
  eventId: varchar("event_id", { length: 128 }).primaryKey(),
  receivedAt: timestamp("received_at").defaultNow(),
});
