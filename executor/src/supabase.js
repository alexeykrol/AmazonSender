const { assertSupabaseProjectScope } = require('./safety');

function createSupabase(url, serviceRoleKey, expectedProjectRef) {
  if (!url || !serviceRoleKey) return null;
  // Lazy require so the process can start even if the runtime Node version is misconfigured.
  // This makes startup failures diagnosable via /health instead of hard 503.
  const { createClient } = require('@supabase/supabase-js');
  assertSupabaseProjectScope({
    url,
    expectedRef: expectedProjectRef,
    context: 'createSupabase'
  });
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

async function fetchActiveSubscribers(client) {
  const { data, error } = await client
    .from('subscribers')
    .select('email, status, from_name')
    .eq('status', 'active')
    .order('email', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function updateSubscriberStatus(client, email, updates) {
  if (!email) throw new Error('email_required');
  // Use upsert so unsubscribe/bounce events still record a suppression entry
  // even if the email is not yet present in the subscribers table.
  const payload = { email, ...updates };
  const { data, error } = await client
    .from('subscribers')
    .upsert(payload, { onConflict: 'email' })
    .select();
  if (error) throw error;
  return data;
}

module.exports = {
  createSupabase,
  fetchActiveSubscribers,
  updateSubscriberStatus
};
