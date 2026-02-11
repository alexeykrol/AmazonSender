#!/usr/bin/env node

/**
 * Create Table via Direct PostgreSQL Connection
 * Requires SUPABASE_DB_PASSWORD in .env
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function createTableDirect() {
  console.log('🔧 Creating table via direct PostgreSQL connection...\n');

  const url = process.env.SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (!url) {
    console.log('❌ SUPABASE_URL not set');
    process.exit(1);
  }

  if (!password) {
    console.log('❌ SUPABASE_DB_PASSWORD not set');
    console.log('\nTo use direct connection:');
    console.log('1. Go to Supabase Dashboard → Settings → Database');
    console.log('2. Copy the "Password" field');
    console.log('3. Add to .env: SUPABASE_DB_PASSWORD=your_password\n');
    process.exit(1);
  }

  const projectRef = url.split('//')[1].split('.')[0];
  const host = `db.${projectRef}.supabase.co`;
  const sqlPath = path.join(__dirname, 'schema.sql');

  // Set password in environment for psql
  process.env.PGPASSWORD = password;

  const command = `psql -h ${host} -U postgres -d postgres -p 5432 -f ${sqlPath}`;

  console.log(`Connecting to: ${host}`);
  console.log(`Running SQL from: ${sqlPath}\n`);

  try {
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes('NOTICE')) {
      console.log('⚠️  Warnings:', stderr);
    }

    console.log(stdout);
    console.log('\n✅ Table created successfully!');
    console.log('\nVerify with: node test-supabase.js\n');

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);

    if (error.message.includes('psql: command not found')) {
      console.log('\n💡 psql not installed. Install PostgreSQL client:');
      console.log('  Mac: brew install postgresql');
      console.log('  Ubuntu: sudo apt-get install postgresql-client');
    } else if (error.message.includes('authentication failed')) {
      console.log('\n💡 Check that SUPABASE_DB_PASSWORD is correct');
    } else if (error.message.includes('could not translate host name')) {
      console.log('\n💡 Check that SUPABASE_URL is correct');
    }

    process.exit(1);
  }
}

createTableDirect();
