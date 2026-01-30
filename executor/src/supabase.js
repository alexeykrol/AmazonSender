const { createClient } = require('@supabase/supabase-js');

function createSupabase(url, serviceRoleKey) {
  if (!url || !serviceRoleKey) return null;
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
  const { data, error } = await client
    .from('subscribers')
    .update(updates)
    .eq('email', email);
  if (error) throw error;
  return data;
}

module.exports = {
  createSupabase,
  fetchActiveSubscribers,
  updateSubscriberStatus
};
