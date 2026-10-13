import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/** CRM Accounts — Salesforce-like company records (Day 1 schema). */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    website: varchar("website", { length: 255 }),
    country: varchar("country", { length: 5 }),
    phone: varchar("phone", { length: 50 }),
    owner: varchar("owner", { length: 255 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    nameIdx: index("accounts_name_idx").on(t.name),
  })
);