/**
 * Import contacts from sessioncloud-users.csv
 * Run: npm run import:csv -- path/to/sessioncloud-users.csv
 */
import { db } from "../src/db";
import { contacts } from "../src/db/schema";
import { parse } from "csv-parse/sync";
import fs from "fs";

async function importCsv() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error("Usage: npm run import:csv -- <path-to-csv>");
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, "utf-8");

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`📥 Found ${records.length} records in CSV`);

  let imported = 0;
  let skipped = 0;
  let testSkipped = 0;

  for (const row of records) {
    if (!row.email || !row.email.includes("@")) {
      skipped++;
      continue;
    }

    // Skip test accounts
    const isTest =
      row.firstname?.toLowerCase() === "test" ||
      row.firstname?.toLowerCase() === "test user" ||
      row.email === "sally@sessiontalk.co.uk";

    if (isTest) {
      testSkipped++;
      continue;
    }

    try {
      await db
        .insert(contacts)
        .values({
          objectId: row.objectId,
          email: row.email.toLowerCase().trim(),
          username: row.username,
          firstname: row.firstname,
          lastname: row.lastname,
          phone: row.phone?.replace(/\(/g, "").replace(/\)/g, ""), // Clean up junk phone numbers
          website: row.website,
          country: row.country,
          emailVerified: row.emailVerified === "True",
          source: "csv_import",
          originalCreatedAt: row.createdAt ? new Date(row.createdAt) : undefined,
        })
        .onConflictDoNothing();

      imported++;
    } catch (err: any) {
      console.error(`  ❌ ${row.email}: ${err.message}`);
      skipped++;
    }

    // Progress indicator every 500 records
    if ((imported + skipped + testSkipped) % 500 === 0) {
      console.log(
        `  ... processed ${imported + skipped + testSkipped}/${records.length}`
      );
    }
  }

  console.log("\n📊 Import complete:");
  console.log(`   Imported:  ${imported}`);
  console.log(`   Test accounts skipped: ${testSkipped}`);
  console.log(`   Other skipped: ${skipped}`);
  console.log(`   Total:     ${records.length}`);
}

importCsv().catch(console.error);
