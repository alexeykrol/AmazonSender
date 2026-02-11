#!/usr/bin/env node

/**
 * Autonomous Database Setup
 * Tries multiple approaches to create the subscribers table
 */

require('dotenv').config();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

async function trySupabaseCLI() {
  console.log('Trying Supabase CLI...');

  try {
    // Check if CLI is available
    await execAsync('which supabase');

    const url = process.env.SUPABASE_URL;
    const projectRef = url.split('//')[1].split('.')[0];

    // Try to execute SQL using CLI
    const sqlPath = path.join(__dirname, 'schema.sql');
    const command = `supabase db execute --project-ref ${projectRef} --file ${sqlPath}`;

    console.log(`   Running: ${command}`);
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes('success')) {
      throw new Error(stderr);
    }

    console.log('   ✅ Table created via Supabase CLI!');
    console.log(stdout);
    return true;
  } catch (error) {
    console.log(`   ❌ CLI failed: ${error.message}`);
    return false;
  }
}

async function tryCurl() {
  console.log('\nTrying direct HTTP API...');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = url.split('//')[1].split('.')[0];

  // Read SQL file
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Try Supabase Management API
  const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  try {
    const command = `curl -X POST "${apiUrl}" \\
      -H "Authorization: Bearer ${key}" \\
      -H "Content-Type: application/json" \\
      -d '{"query": ${JSON.stringify(sql)}}'`;

    const { stdout, stderr } = await execAsync(command);

    if (stdout.includes('error') || stderr) {
      throw new Error(stdout || stderr);
    }

    console.log('   ✅ Table created via HTTP API!');
    return true;
  } catch (error) {
    console.log(`   ❌ HTTP API failed: ${error.message}`);
    return false;
  }
}

async function provideInstructions() {
  console.log('\n' + '='.repeat(70));
  console.log('Manual Setup Required');
  console.log('='.repeat(70));

  const url = process.env.SUPABASE_URL;
  const projectRef = url.split('//')[1].split('.')[0];

  console.log('\nAutomatic setup is not available.');
  console.log('Please run the SQL manually:\n');

  console.log('Option 1: Supabase Dashboard');
  console.log(`  1. Go to https://supabase.com/dashboard/project/${projectRef}/editor`);
  console.log('  2. Click "SQL Editor" in left sidebar');
  console.log('  3. Click "New query"');
  console.log('  4. Copy and paste the SQL from: executor/schema.sql');
  console.log('  5. Click "Run"\n');

  console.log('Option 2: Command Line');
  console.log('  If you have the database password:');
  console.log(`  psql -h db.${projectRef}.supabase.co -U postgres -d postgres -f executor/schema.sql\n`);

  console.log('After creating the table, verify with:');
  console.log('  node test-supabase.js\n');
}

async function main() {
  console.log('🔧 AmazonSender Database Setup\n');

  // Try automated approaches
  if (await trySupabaseCLI()) {
    console.log('\n✅ Database setup complete!');
    console.log('Verify with: node test-supabase.js\n');
    return;
  }

  if (await tryCurl()) {
    console.log('\n✅ Database setup complete!');
    console.log('Verify with: node test-supabase.js\n');
    return;
  }

  // Fallback to instructions
  provideInstructions();
}

main().catch(error => {
  console.error('\n❌ Setup error:', error);
  process.exit(1);
});
