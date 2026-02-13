/**
 * Dry-run test for import-subscribers
 * Tests parsing and deduplication without Supabase
 */

const path = require('path');

// Mock the parseCSV logic
const fs = require('fs');
const {
  normalizeEmail,
  isValidEmail,
  parseCSVLine,
  deduplicateSubscribers
} = require('../import-subscribers.js');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCSV(filePath) {
  console.log(`📂 Reading CSV file: ${filePath}\n`);

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  const emailIdx = headers.findIndex(h => h === 'email');
  const nameIdx = headers.findIndex(h => h === 'name');

  console.log(`📋 CSV structure:`);
  console.log(`   Total lines: ${lines.length}`);
  console.log(`   Email column: ${emailIdx}`);
  console.log(`   Name column: ${nameIdx}\n`);

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

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Dry-Run Import Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const testFile = path.join(__dirname, 'sample-import.csv');
const { subscribers, invalid, total } = parseCSV(testFile);

console.log(`✅ Parsed ${subscribers.length} valid subscribers`);
console.log(`⚠️  Skipped ${invalid.length} invalid rows\n`);

if (invalid.length > 0) {
  console.log('📋 Invalid rows:');
  invalid.forEach(inv => {
    console.log(`   Line ${inv.line}: ${inv.email || 'N/A'} - ${inv.reason}`);
  });
  console.log('');
}

const { unique, duplicates } = deduplicateSubscribers(subscribers);

console.log(`🔍 Deduplication:`);
console.log(`   Unique subscribers: ${unique.length}`);
console.log(`   Duplicates removed: ${duplicates.length}\n`);

if (duplicates.length > 0) {
  console.log(`📋 Duplicates found: ${duplicates.join(', ')}\n`);
}

console.log('📊 Unique subscribers to import:');
unique.forEach((sub, idx) => {
  console.log(`   ${idx + 1}. ${sub.email} - "${sub.from_name}"`);
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Dry-run completed successfully!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
