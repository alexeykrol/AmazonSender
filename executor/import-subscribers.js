/**
 * Import Subscribers from CSV to Supabase
 *
 * Features:
 * - Idempotent: safe to rerun without creating duplicates
 * - Email validation and normalization (lowercase)
 * - Deduplication before insert (case-insensitive)
 * - Upsert behavior (update if exists, insert if new)
 * - Detailed import report with counts
 *
 * Usage:
 *   node import-subscribers.js <csv-file-path>
 *
 * Example:
 *   node import-subscribers.js "/path/to/subscribers.csv"
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { assertSupabaseProjectScope } = require('./src/safety');

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize email to lowercase for case-insensitive comparison
 */
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email);
}

/**
 * Parse CSV line (simple parser, handles quoted fields)
 * Handles escaped quotes: "" inside quoted fields becomes "
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Check if this is an escaped quote ("" inside quoted field)
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped quote: add literal " and skip next character
        current += '"';
        i++; // Skip the second quote
      } else {
        // Toggle quote mode (opening or closing quote)
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current); // Add last field

  return fields;
}

/**
 * Parse CSV file and extract subscriber data
 */
function parseCSV(filePath) {
  console.log(`📂 Reading CSV file: ${filePath}\n`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Find column indices
  const emailIdx = headers.findIndex(h => h === 'email');
  const nameIdx = headers.findIndex(h => h === 'name');

  if (emailIdx === -1) {
    throw new Error('CSV must have "email" column');
  }

  console.log(`📋 CSV structure:`);
  console.log(`   Total lines: ${lines.length}`);
  console.log(`   Header columns: ${headers.length}`);
  console.log(`   Email column: ${emailIdx}`);
  console.log(`   Name column: ${nameIdx >= 0 ? nameIdx : 'not found (will use empty)'}\n`);

  // Parse rows
  const subscribers = [];
  const invalid = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = parseCSVLine(line);
    const email = fields[emailIdx]?.trim();
    const name = nameIdx >= 0 ? fields[nameIdx]?.trim() : '';

    if (!email) {
      invalid.push({ line: i + 1, reason: 'empty email' });
      continue;
    }

    if (!isValidEmail(email)) {
      invalid.push({ line: i + 1, email, reason: 'invalid format' });
      continue;
    }

    subscribers.push({
      email: normalizeEmail(email),
      from_name: name || '',
      status: 'active'
    });
  }

  return { subscribers, invalid, total: lines.length - 1 };
}

/**
 * Deduplicate subscribers by email (case-insensitive)
 * Keep first occurrence
 */
function deduplicateSubscribers(subscribers) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];

  for (const sub of subscribers) {
    const normalizedEmail = sub.email; // Already normalized

    if (seen.has(normalizedEmail)) {
      duplicates.push(normalizedEmail);
    } else {
      seen.add(normalizedEmail);
      unique.push(sub);
    }
  }

  return { unique, duplicates };
}

/**
 * Import subscribers to Supabase with upsert behavior
 */
async function importToSupabase(subscribers) {
  console.log(`🔄 Importing ${subscribers.length} subscribers to Supabase...\n`);

  assertSupabaseProjectScope({
    url: process.env.SUPABASE_URL,
    expectedRef: process.env.SUPABASE_PROJECT_REF,
    context: 'import-subscribers'
  });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Batch size for upsert
  const BATCH_SIZE = 100;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);

    try {
      // Check which emails already exist
      const emails = batch.map(s => s.email);
      const { data: existing, error: selectError } = await supabase
        .from('subscribers')
        .select('email')
        .in('email', emails);

      if (selectError) {
        console.error(`❌ Error checking existing emails: ${selectError.message}`);
        errors += batch.length;
        continue;
      }

      const existingEmails = new Set(existing.map(e => e.email));

      // Separate into insert and update batches
      const toInsert = batch.filter(s => !existingEmails.has(s.email));
      const toUpdate = batch.filter(s => existingEmails.has(s.email));

      // Insert new subscribers
      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('subscribers')
          .insert(toInsert);

        if (insertError) {
          console.error(`❌ Error inserting batch: ${insertError.message}`);
          errors += toInsert.length;
        } else {
          inserted += toInsert.length;
        }
      }

      // Update existing subscribers (only from_name if provided)
      for (const sub of toUpdate) {
        if (sub.from_name) {
          const { error: updateError } = await supabase
            .from('subscribers')
            .update({ from_name: sub.from_name })
            .eq('email', sub.email);

          if (updateError) {
            console.error(`❌ Error updating ${sub.email}: ${updateError.message}`);
            errors++;
          } else {
            updated++;
          }
        } else {
          // Email exists but no new name to update - count as skipped
          skipped++;
        }
      }

      // Progress indicator
      const processed = Math.min(i + BATCH_SIZE, subscribers.length);
      process.stdout.write(`\r   Processed: ${processed}/${subscribers.length}`);

    } catch (err) {
      console.error(`\n❌ Batch error: ${err.message}`);
      errors += batch.length;
    }
  }

  console.log('\n');
  return { inserted, updated, skipped, errors };
}

/**
 * Generate and save import report
 */
function generateReport(stats) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportDir = path.join(__dirname, '../.coord/reports');
  const reportPath = path.join(reportDir, `import-subscribers-${timestamp}.md`);

  // Ensure directory exists
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Calculate reason counts for invalid rows
  const reasonCounts = {};
  for (const inv of stats.invalid) {
    reasonCounts[inv.reason] = (reasonCounts[inv.reason] || 0) + 1;
  }

  const reasonCountsText = Object.entries(reasonCounts)
    .map(([reason, count]) => `  - ${reason}: ${count}`)
    .join('\n');

  const report = `# Subscriber Import Report

**Date:** ${new Date().toISOString()}

## Summary

- **Total rows in CSV:** ${stats.total}
- **Valid subscribers parsed:** ${stats.valid}
- **Invalid rows skipped:** ${stats.invalid.length}
- **Duplicates in CSV removed:** ${stats.duplicatesRemoved}
- **Unique subscribers to import:** ${stats.unique}

## Import Results

- **Inserted (new):** ${stats.inserted}
- **Updated (existing):** ${stats.updated}
- **Skipped (no update needed):** ${stats.skipped}
- **Errors:** ${stats.errors}

## Invalid Row Reasons

${reasonCountsText || '- None'}

## Invalid Rows (Detail)

${stats.invalid.length > 0 ? stats.invalid.map(inv =>
  `- Line ${inv.line}: ${inv.email || 'N/A'} - ${inv.reason}`
).join('\n') : '- None'}

## Status

${stats.errors > 0 ? '⚠️ **Import completed with errors**' : '✅ **Import completed successfully**'}
`;

  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`📄 Report saved: ${reportPath}\n`);

  return reportPath;
}

/**
 * Main import function
 */
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📥 Subscriber Import Tool');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check arguments
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('❌ Usage: node import-subscribers.js <csv-file-path>');
    console.error('   Example: node import-subscribers.js "/path/to/file.csv"');
    process.exit(1);
  }

  // Check environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  try {
    // Step 1: Parse CSV
    const { subscribers, invalid, total } = parseCSV(csvPath);
    console.log(`✅ Parsed ${subscribers.length} valid subscribers`);
    console.log(`⚠️  Skipped ${invalid.length} invalid rows\n`);

    // Step 2: Deduplicate
    const { unique, duplicates } = deduplicateSubscribers(subscribers);
    console.log(`🔍 Deduplication:`);
    console.log(`   Unique subscribers: ${unique.length}`);
    console.log(`   Duplicates removed: ${duplicates.length}\n`);

    if (duplicates.length > 0) {
      console.log(`📋 First few duplicates: ${duplicates.slice(0, 5).join(', ')}${duplicates.length > 5 ? '...' : ''}\n`);
    }

    // Step 3: Import to Supabase
    const { inserted, updated, skipped, errors } = await importToSupabase(unique);

    // Step 4: Generate report
    const stats = {
      total,
      valid: subscribers.length,
      invalid,
      duplicatesRemoved: duplicates.length,
      unique: unique.length,
      inserted,
      updated,
      skipped,
      errors
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Final Results');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Total CSV rows: ${total}`);
    console.log(`   Valid subscribers: ${stats.valid}`);
    console.log(`   Invalid skipped: ${invalid.length}`);
    console.log(`   CSV duplicates removed: ${duplicates.length}`);
    console.log(`   Unique to import: ${unique.length}`);
    console.log(`   ✅ Inserted: ${inserted}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}\n`);

    const reportPath = generateReport(stats);

    if (errors > 0) {
      console.log('⚠️  Import completed with errors. See report for details.');
      process.exit(1);
    } else {
      console.log('✅ Import completed successfully!');
    }

  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  normalizeEmail,
  isValidEmail,
  parseCSVLine,
  deduplicateSubscribers
};
