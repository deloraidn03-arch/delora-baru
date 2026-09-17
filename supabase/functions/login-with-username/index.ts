// Edge Function: login-with-username
// Deploy: supabase functions deploy login-with-username
// Alur: username → profiles (email) → cek email_confirmed_at (403 bila belum) → signInWithPassword → session

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { username, password } = await req.json();
    if (!username || !password) return json({ error: 'Username dan password wajib diisi' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Cari email dari username
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email')
      .ilike('username', String(username).trim())
      .maybeSingle();
    if (!profile) return json({ error: 'Username tidak ditemukan' }, 401);

    // 2. Wajib: email sudah terverifikasi (403 bila belum)
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(profile.id);
    if (userErr || !userData?.user) return json({ error: 'User tidak ditemukan' }, 401);
    if (!userData.user.email_confirmed_at) {
      return json({ error: 'Email belum terverifikasi. Silakan cek email Anda.' }, 403);
    }

    // 3. Verifikasi password lewat sign-in standar
    const anon = createClient(supabaseUrl, anonKey);
    const { data, error } = await anon.auth.signInWithPassword({ email: profile.email, password });
    if (error || !data.session) return json({ error: 'Password salah' }, 401);

    return json({ session: data.session, user: { id: data.user.id, email: data.user.email } }, 200);
  } catch (err) {
    return json({ error: 'Kesalahan server: ' + (err as Error).message }, 500);
  }
});
