#!/usr/bin/env node

/**
 * Create Supabase Table Programmatically
 * Uses HTTP API with proper request handling
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function createTable() {
  console.log('🔧 Creating subscribers table...\n');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log('❌ Missing Supabase credentials');
    process.exit(1);
  }

  // Read SQL
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Try using Supabase SQL API (if available)
  const projectRef = url.split('//')[1].split('.')[0];

  try {
    // Approach 1: Try Supabase Management API
    console.log('Attempting via Management API...');

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });

    const result = await response.json();

    if (response.ok && !result.error) {
      console.log('✅ Table created successfully via Management API!');
      console.log(result);
      return true;
    }

    console.log(`❌ Management API failed: ${result.message || JSON.stringify(result)}`);

  } catch (error) {
    console.log(`❌ Management API error: ${error.message}`);
  }

  // Approach 2: Try using REST API with RPC
  try {
    console.log('\nAttempting via RPC...');

    const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql: sql })
    });

    const result = await response.text();

    if (response.ok) {
      console.log('✅ Table created successfully via RPC!');
      console.log(result);
      return true;
    }

    console.log(`❌ RPC failed: ${result}`);

  } catch (error) {
    console.log(`❌ RPC error: ${error.message}`);
  }

  // All methods failed
  console.log('\n' + '='.repeat(70));
  console.log('❌ Automatic creation not available');
  console.log('='.repeat(70));
  console.log('\nPlease create the table manually:');
  console.log(`\n1. Go to: https://supabase.com/dashboard/project/${projectRef}/editor`);
  console.log('2. Click "SQL Editor"');
  console.log('3. Run the SQL from: executor/schema.sql\n');

  console.log('Or if you have the database password, add to .env:');
  console.log('  SUPABASE_DB_PASSWORD=your_password');
  console.log('\nThen run: node create-table-direct.js\n');

  return false;
}

createTable().then(success => {
  if (success) {
    console.log('\nVerify with: node test-supabase.js');
    process.exit(0);
  } else {
    process.exit(1);
  }
});
