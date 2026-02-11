#!/usr/bin/env node

/**
 * Setup Supabase Database Schema
 * Creates subscribers table with proper structure
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function setupDatabase() {
  console.log('🔧 Setting up Supabase database...\n');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log('❌ Missing Supabase credentials in .env');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  // Create subscribers table
  console.log('1. Creating subscribers table...');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS subscribers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      bounce_type TEXT,
      bounce_subtype TEXT,
      status_updated_at TIMESTAMPTZ,
      from_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
    CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
  `;

  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: createTableSQL
    });

    if (error) {
      // If RPC doesn't exist, try using REST API directly
      console.log('   ⚠️  Cannot use RPC, trying alternative method...');

      // Alternative: Use Supabase client to insert a test record which will auto-create the table
      // This won't work - we need to use SQL Editor or API
      console.log('\n⚠️  Supabase table creation requires SQL execution.');
      console.log('\nPlease run this SQL in Supabase Dashboard → SQL Editor:\n');
      console.log('─'.repeat(60));
      console.log(createTableSQL.trim());
      console.log('─'.repeat(60));
      console.log('\nAfter running the SQL, test with: node test-supabase.js\n');
      process.exit(0);
    }

    console.log('   ✅ Table created successfully!');

  } catch (error) {
    console.log(`   ⚠️  ${error.message}`);
    console.log('\nPlease run this SQL in Supabase Dashboard → SQL Editor:\n');
    console.log('─'.repeat(60));
    console.log(createTableSQL.trim());
    console.log('─'.repeat(60));
    console.log('\nSteps:');
    console.log('1. Go to https://supabase.com/dashboard/project/' + url.split('//')[1].split('.')[0]);
    console.log('2. Click "SQL Editor" in left sidebar');
    console.log('3. Click "New query"');
    console.log('4. Paste the SQL above');
    console.log('5. Click "Run"');
    console.log('\nAfter running the SQL, test with: node test-supabase.js\n');
  }
}

setupDatabase().catch(error => {
  console.error('\n❌ Setup error:', error);
  process.exit(1);
});
