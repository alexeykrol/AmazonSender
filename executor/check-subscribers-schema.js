/**
 * Check subscribers table schema
 * Verifies all required columns exist
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

async function checkSchema() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Checking subscribers table schema');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // Insert a test row with all fields to see what columns exist
    const testEmail = `schema_check_${Date.now()}@test.local`;

    console.log('📝 Inserting test row with all expected fields...\n');

    const { data, error } = await supabase
      .from('subscribers')
      .insert({
        email: testEmail,
        status: 'active',
        from_name: 'Schema Test',
        bounce_type: null,
        bounce_subtype: null,
        status_updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.log(`❌ Insert failed: ${error.message}`);
      console.log(`Code: ${error.code}`);

      if (error.message.includes('column')) {
        console.log('\n⚠️  Some columns might be missing. Error details:');
        console.log(error.details || error.hint || 'No additional details');
      }
      console.log('');
      return;
    }

    const row = data[0];
    console.log('✅ Successfully inserted test row\n');
    console.log('📊 Table structure (columns found):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const columns = Object.keys(row);
    columns.forEach(col => {
      const value = row[col];
      const type = typeof value;
      const displayValue = value === null ? 'NULL' :
                          type === 'string' ? `"${value.substring(0, 30)}${value.length > 30 ? '...' : ''}"` :
                          value;
      console.log(`  ${col.padEnd(25)} ${type.padEnd(10)} ${displayValue}`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Required columns check:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const required = [
      'id',
      'email',
      'status',
      'from_name',
      'bounce_type',
      'bounce_subtype',
      'status_updated_at',
      'created_at'
    ];

    const missing = [];
    const found = [];

    required.forEach(col => {
      if (columns.includes(col)) {
        console.log(`  ✅ ${col}`);
        found.push(col);
      } else {
        console.log(`  ❌ ${col} - MISSING`);
        missing.push(col);
      }
    });

    console.log('');

    if (missing.length > 0) {
      console.log('⚠️  Missing columns:', missing.join(', '));
      console.log('   These columns need to be added to the table.');
    } else {
      console.log('🎉 All required columns present!');
    }

    console.log('');

    // Cleanup
    await supabase.from('subscribers').delete().eq('email', testEmail);
    console.log('🧹 Test row cleaned up\n');

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}

checkSchema();
