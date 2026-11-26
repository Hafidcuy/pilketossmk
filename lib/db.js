import { createClient } from '@supabase/supabase-js';

let client;

export function getDb() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diatur di Environment Variables Vercel.');
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'pilketos-smkkrian1' } }
  });
  return client;
}

export const SETTINGS_ID = 1;

export async function getSettings(db) {
  const { data, error } = await db.from('settings').select('*').eq('id', SETTINGS_ID).maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: created, error: err2 } = await db.from('settings')
      .insert({ id: SETTINGS_ID }).select('*').single();
    if (err2) throw err2;
    return created;
  }
  return data;
}

export async function updateSettings(db, patch) {
  const { data, error } = await db.from('settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', SETTINGS_ID)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getCandidates(db) {
  const { data, error } = await db.from('paslon').select('*').order('number', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getTally(db) {
  // PostgREST membatasi rows yang dikembalikan (default 1000), jadi hitung
  // memakai count=exact agar tetap akurat untuk ribuan suara.
  const [{ count: total, error: totalErr }, { data: candidates, error: candErr }] = await Promise.all([
    db.from('votes').select('id', { count: 'exact', head: true }),
    db.from('paslon').select('id')
  ]);
  if (totalErr) throw totalErr;
  if (candErr) throw candErr;

  const results = await Promise.all((candidates || []).map((c) =>
    db.from('votes').select('id', { count: 'exact', head: true }).eq('paslon_id', c.id)
  ));
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) throw firstError;

  const tally = {};
  (candidates || []).forEach((c, i) => { tally[c.id] = results[i].count || 0; });
  return { tally, total: total || 0 };
}
