const { config } = require('../src/config');
const { createSupabase } = require('../src/supabase');

let supabase = null;
let supabaseInitError = null;

function getSupabase() {
  if (supabase || supabaseInitError) {
    return { supabase, supabaseInitError };
  }
  try {
    supabase = createSupabase(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      config.supabase.projectRef
    );
  } catch (err) {
    supabaseInitError = err;
    supabase = null;
  }
  return { supabase, supabaseInitError };
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  if (req.body) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body);
  }
  const raw = await readRawBody(req);
  if (!raw) return null;
  return JSON.parse(raw);
}

module.exports = {
  config,
  getSupabase,
  readJsonBody
};

