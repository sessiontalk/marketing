import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

/**
 * CRM Opportunities — pipeline deals linked to accounts.
 * primaryContactId is a logical FK to contacts.id (no Drizzle .references
 * here to keep this file merge-safe vs schema.ts / CoS edits).
 */
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id)
      .notNull(),
    primaryContactId: uuid("primary_contact_id"),
    name: varchar("name", { length: 255 }).notNull(),
    stage: varchar("stage", { length: 30 }).notNull().default("new"), // new|qualified|demo|proposal|won|lost
    amount: integer("amount"), // cents
    currency: varchar("currency", { length: 3 }).default("GBP"),
    closeDate: timestamp("close_date"),
    owner: varchar("owner", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    stageIdx: index("opportunities_stage_idx").on(t.stage),
    accountIdx: index("opportunities_account_id_idx").on(t.accountId),
    primaryContactIdx: index("opportunities_primary_contact_id_idx").on(
      t.primaryContactId
    ),
  })
);