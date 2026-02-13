#!/usr/bin/env node

/**
 * Environment Variables Checker
 * Validates that all required credentials are set
 */

require('dotenv').config();

const REQUIRED_VARS = [
  // Notion
  { name: 'NOTION_API_TOKEN', description: 'Notion Integration Token' },
  { name: 'NOTION_DB_MAILOUTS_ID', description: 'Notion Mailouts Database ID' },
  { name: 'NOTION_DB_ERRORS_ID', description: 'Notion Errors Database ID' },

  // Supabase
  { name: 'SUPABASE_URL', description: 'Supabase Project URL' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Supabase Service Role Key' },

  // AWS
  { name: 'AWS_REGION', description: 'AWS Region' },
  { name: 'AWS_ACCESS_KEY_ID', description: 'AWS Access Key ID' },
  { name: 'AWS_SECRET_ACCESS_KEY', description: 'AWS Secret Access Key' },
  { name: 'SES_FROM_EMAIL', description: 'SES From Email' },
  { name: 'FROM_NAME', description: 'From Name' },

  // Testing
  { name: 'TEST_EMAILS', description: 'Test Emails (comma-separated)' },

  // Organization
  { name: 'ORG_NAME', description: 'Organization Name' },
  { name: 'ORG_ADDRESS', description: 'Organization Address' },
  { name: 'UNSUBSCRIBE_SECRET', description: 'Unsubscribe Token Secret' },
];

const OPTIONAL_VARS = [
  'SUPABASE_PROJECT_REF',
  'NOTION_WEBHOOK_VERIFICATION_TOKEN',
  'REPLY_TO_EMAIL',
  'FOOTER_HTML',
  'FOOTER_TEXT',
  'EXECUTOR_SHARED_SECRET',
];

console.log('🔍 Checking environment variables...\n');

let missingCount = 0;
let filledCount = 0;

// Check required variables
console.log('📋 Required Variables:\n');
REQUIRED_VARS.forEach(({ name, description }) => {
  const value = process.env[name];
  const isFilled = value && value.trim() !== '';

  if (isFilled) {
    // Mask sensitive values
    const maskedValue = name.includes('KEY') || name.includes('SECRET') || name.includes('TOKEN')
      ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
      : value.length > 50
        ? `${value.substring(0, 30)}...`
        : value;

    console.log(`  ✅ ${name}`);
    console.log(`     ${description}: ${maskedValue}`);
    filledCount++;
  } else {
    console.log(`  ❌ ${name}`);
    console.log(`     ${description}: MISSING`);
    missingCount++;
  }
  console.log('');
});

// Check optional variables
console.log('📝 Optional Variables:\n');
OPTIONAL_VARS.forEach(name => {
  const value = process.env[name];
  const isFilled = value && value.trim() !== '';

  if (isFilled) {
    console.log(`  ✅ ${name}: Set`);
  } else {
    console.log(`  ⚪ ${name}: Not set (optional)`);
  }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('\n📊 Summary:\n');
console.log(`  ✅ Filled: ${filledCount}/${REQUIRED_VARS.length} required variables`);
console.log(`  ❌ Missing: ${missingCount}/${REQUIRED_VARS.length} required variables`);

if (missingCount > 0) {
  console.log('\n⚠️  Configuration incomplete!');
  console.log('   Please fill in the missing variables in .env file');
  console.log('   See .env comments for instructions on how to get each credential');
  process.exit(1);
} else {
  console.log('\n✅ All required variables are set!');
  console.log('   You can now run: npm start');
  process.exit(0);
}
