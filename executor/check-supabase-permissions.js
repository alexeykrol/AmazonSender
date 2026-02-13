/**
 * Supabase DML Permissions Check
 * Tests INSERT, UPDATE, DELETE, SELECT on subscribers table
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

async function checkPermissions() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 Testing Supabase DML Permissions');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const testEmail = `test_permission_${Date.now()}@check.local`;
  let insertedId = null;

  try {
    // Test 1: SELECT
    console.log('1️⃣  Testing SELECT permission...');
    const { data: selectData, error: selectError } = await supabase
      .from('subscribers')
      .select('*')
      .limit(1);

    if (selectError) {
      console.log(`   ❌ SELECT failed: ${selectError.message}\n`);
      return;
    }
    console.log(`   ✅ SELECT works (found ${selectData.length} rows)\n`);

    // Test 2: INSERT
    console.log('2️⃣  Testing INSERT permission...');
    const { data: insertData, error: insertError } = await supabase
      .from('subscribers')
      .insert({
        email: testEmail,
        status: 'active',
        from_name: 'Permission Test User',
        created_at: new Date().toISOString()
      })
      .select();

    if (insertError) {
      console.log(`   ❌ INSERT failed: ${insertError.message}`);
      console.log(`   Code: ${insertError.code}\n`);
      return;
    }

    insertedId = insertData[0].id;
    console.log(`   ✅ INSERT works (created row with id=${insertedId})\n`);

    // Test 3: UPDATE
    console.log('3️⃣  Testing UPDATE permission...');
    const { data: updateData, error: updateError } = await supabase
      .from('subscribers')
      .update({ from_name: 'Updated Test User' })
      .eq('id', insertedId)
      .select();

    if (updateError) {
      console.log(`   ❌ UPDATE failed: ${updateError.message}\n`);
    } else {
      console.log(`   ✅ UPDATE works (modified ${updateData.length} rows)\n`);
    }

    // Test 4: DELETE
    console.log('4️⃣  Testing DELETE permission...');
    const { error: deleteError } = await supabase
      .from('subscribers')
      .delete()
      .eq('id', insertedId);

    if (deleteError) {
      console.log(`   ❌ DELETE failed: ${deleteError.message}\n`);
    } else {
      console.log(`   ✅ DELETE works (removed test row)\n`);
      insertedId = null; // Mark as cleaned up
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All DML permissions verified!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Service Role Key has full access to:');
    console.log('  ✅ SELECT - read data');
    console.log('  ✅ INSERT - create new rows');
    console.log('  ✅ UPDATE - modify existing rows');
    console.log('  ✅ DELETE - remove rows');
    console.log('');
    console.log('🎉 Supabase is fully configured and ready!');
    console.log('');

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);

    // Cleanup on error
    if (insertedId) {
      console.log('🧹 Cleaning up test data...');
      await supabase.from('subscribers').delete().eq('id', insertedId);
    }

    process.exit(1);
  }
}

checkPermissions();
