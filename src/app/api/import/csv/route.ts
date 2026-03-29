import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const content = await file.text();

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  let imported = 0;
  let skipped = 0;
  let errors: string[] = [];

  for (const row of records) {
    try {
      if (!row.email || !row.email.includes("@")) {
        skipped++;
        continue;
      }

      // Skip obvious test accounts
      const isTest =
        row.firstname?.toLowerCase() === "test" ||
        row.email === "sally@sessiontalk.co.uk";

      if (isTest) {
        skipped++;
        continue;
      }

      await db
        .insert(contacts)
        .values({
          objectId: row.objectId,
          email: row.email.toLowerCase().trim(),
          username: row.username,
          firstname: row.firstname,
          lastname: row.lastname,
          phone: row.phone,
          website: row.website,
          country: row.country,
          emailVerified: row.emailVerified === "True",
          source: "csv_import",
          originalCreatedAt: row.createdAt ? new Date(row.createdAt) : undefined,
        })
        .onConflictDoNothing(); // Skip duplicates by email

      imported++;
    } catch (err: any) {
      errors.push(`Row ${row.email}: ${err.message}`);
      skipped++;
    }
  }

  return NextResponse.json({
    total: records.length,
    imported,
    skipped,
    errors: errors.slice(0, 10), // First 10 errors only
  });
}
