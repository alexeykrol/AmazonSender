#!/usr/bin/env node

/**
 * Test Notion API Connection
 */

require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

async function testNotionAccess() {
  console.log('🔍 Testing Notion API access...\n');

  // Test 1: API Token
  console.log('1. Testing API Token...');
  const token = process.env.NOTION_API_TOKEN;
  if (!token) {
    console.log('   ❌ NOTION_API_TOKEN not set');
    process.exit(1);
  }
  console.log(`   ✅ Token set: ${token.substring(0, 10)}...`);

  // Test 2: Mailouts Database
  console.log('\n2. Testing Mailouts Database access...');
  const mailoutDbId = process.env.NOTION_DB_MAILOUTS_ID;
  if (!mailoutDbId) {
    console.log('   ❌ NOTION_DB_MAILOUTS_ID not set');
    process.exit(1);
  }
  console.log(`   Database ID: ${mailoutDbId}`);

  try {
    const mailoutDb = await notion.databases.retrieve({
      database_id: mailoutDbId
    });
    console.log(`   ✅ Connected! Database: "${mailoutDb.title[0]?.plain_text || 'Untitled'}"`);

    // Check properties
    console.log('\n   Properties found:');
    Object.keys(mailoutDb.properties).forEach(propName => {
      const prop = mailoutDb.properties[propName];
      console.log(`     - ${propName} (${prop.type})`);
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    if (error.code === 'object_not_found') {
      console.log('\n   💡 Possible fixes:');
      console.log('      1. Check Database ID is correct');
      console.log('      2. Make sure you shared the database with the integration');
      console.log('         → Open database → "..." → Connections → Add "AmazonSender"');
    }
    process.exit(1);
  }

  // Test 3: Errors Database
  console.log('\n3. Testing Errors Database access...');
  const errorDbId = process.env.NOTION_DB_ERRORS_ID;
  if (!errorDbId) {
    console.log('   ❌ NOTION_DB_ERRORS_ID not set');
    process.exit(1);
  }
  console.log(`   Database ID: ${errorDbId}`);

  try {
    const errorDb = await notion.databases.retrieve({
      database_id: errorDbId
    });
    console.log(`   ✅ Connected! Database: "${errorDb.title[0]?.plain_text || 'Untitled'}"`);

    // Check properties
    console.log('\n   Properties found:');
    Object.keys(errorDb.properties).forEach(propName => {
      const prop = errorDb.properties[propName];
      console.log(`     - ${propName} (${prop.type})`);
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    if (error.code === 'object_not_found') {
      console.log('\n   💡 Possible fixes:');
      console.log('      1. Check Database ID is correct');
      console.log('      2. Make sure you shared the database with the integration');
      console.log('         → Open database → "..." → Connections → Add "AmazonSender"');
    }
    process.exit(1);
  }

  // Test 4: Check required properties
  console.log('\n4. Checking required properties...');

  const requiredMailoutProps = ['Status', 'Test', 'Sent At', 'Sent Count'];
  const mailoutDb = await notion.databases.retrieve({ database_id: mailoutDbId });
  const mailoutProps = Object.keys(mailoutDb.properties);

  let missingProps = [];
  requiredMailoutProps.forEach(required => {
    if (!mailoutProps.includes(required)) {
      missingProps.push(required);
    }
  });

  if (missingProps.length > 0) {
    console.log(`   ⚠️  Missing properties in Mailouts database: ${missingProps.join(', ')}`);
    console.log('      Add these properties to the database');
  } else {
    console.log('   ✅ All required properties found in Mailouts database');
  }

  const requiredErrorProps = ['Timestamp', 'Mailout ID', 'Error Message'];
  const errorDb = await notion.databases.retrieve({ database_id: errorDbId });
  const errorProps = Object.keys(errorDb.properties);

  missingProps = [];
  requiredErrorProps.forEach(required => {
    if (!errorProps.includes(required)) {
      missingProps.push(required);
    }
  });

  if (missingProps.length > 0) {
    console.log(`   ⚠️  Missing properties in Errors database: ${missingProps.join(', ')}`);
    console.log('      Add these properties to the database');
  } else {
    console.log('   ✅ All required properties found in Errors database');
  }

  // Success!
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Notion API connection successful!');
  console.log('   All databases are accessible and properly configured.');
  console.log('\n   Next step: Configure Supabase');
}

testNotionAccess().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
