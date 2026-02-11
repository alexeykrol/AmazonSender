#!/usr/bin/env node

/**
 * Test Supabase Connection
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testSupabaseAccess() {
  console.log('🔍 Testing Supabase connection...\n');

  // Test 1: Credentials
  console.log('1. Testing credentials...');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.log('   ❌ SUPABASE_URL not set');
    process.exit(1);
  }
  if (!key) {
    console.log('   ❌ SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }

  console.log(`   ✅ URL: ${url}`);
  console.log(`   ✅ Key: ${key.substring(0, 20)}...`);

  // Test 2: Connection
  console.log('\n2. Testing connection...');
  const supabase = createClient(url, key);

  try {
    // Try to query system table (auth.users or similar)
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === '42P01') {
        console.log('   ⚠️  Table "subscribers" does not exist yet');
        console.log('   ℹ️  This is expected if you haven\'t created the table');
        console.log('   ℹ️  Connection is working, table just needs to be created');
        console.log('\n   Next step: Create table using SQL Editor');
        return;
      }
      throw error;
    }

    console.log('   ✅ Connection successful!');
    console.log(`   ✅ Table "subscribers" exists`);
    console.log(`   ℹ️  Current rows: ${data?.length || 0}`);

  } catch (error) {
    console.log(`   ❌ Connection error: ${error.message}`);
    console.log(`   Code: ${error.code}`);
    process.exit(1);
  }

  // Test 3: Write access
  console.log('\n3. Testing write access...');
  try {
    const testEmail = `test_${Date.now()}@example.com`;

    const { data, error } = await supabase
      .from('subscribers')
      .insert({
        email: testEmail,
        status: 'active',
        from_name: 'Test User'
      })
      .select();

    if (error) throw error;

    console.log('   ✅ Write access confirmed!');
    console.log(`   ✅ Test record created: ${testEmail}`);

    // Clean up test record
    await supabase
      .from('subscribers')
      .delete()
      .eq('email', testEmail);

    console.log('   ✅ Test record cleaned up');

  } catch (error) {
    console.log(`   ❌ Write error: ${error.message}`);
  }

  // Success!
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Supabase connection successful!');
  console.log('   Service role key has full access.');
  console.log('\n   Next step: Configure AWS SES');
}

testSupabaseAccess().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
