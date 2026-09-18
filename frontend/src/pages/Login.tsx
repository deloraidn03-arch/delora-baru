import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase, supabaseConfigured, supabaseUrl } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { session } = useAuth();

  React.useEffect(() => {
    if (session) navigate('/', { replace: true });
  }, [session, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return toast.error('Harap isi username dan password');
    setBusy(true);
    try {
      // Login via Edge Function login-with-username
      const res = await fetch(`${supabaseUrl}/functions/v1/login-with-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (res.status === 403) {
        toast.error(data?.error || 'Email belum terverifikasi. Silakan cek email Anda.');
        return;
      }
      if (!res.ok || !data?.session) {
        toast.error(data?.error || 'Login gagal. Periksa username dan password.');
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (error) {
        toast.error('Gagal memulai sesi: ' + error.message);
        return;
      }
      toast.success('Selamat datang di Delora');
      navigate('/', { replace: true });
    } catch (err: any) {
      toast.error('Login gagal: ' + (err?.message || 'kesalahan jaringan'));
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) return toast.error('Harap isi semua field wajib');
    if (password.length < 6) return toast.error('Password minimal 6 karakter');
    setBusy(true);
    try {
      const { data: available } = await supabase.rpc('username_available', { p_username: username.trim() });
      if (available === false) {
        toast.error('Username sudah dipakai');
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: username.trim() } },
      });
      if (error) {
        toast.error('Gagal mendaftar: ' + error.message);
        return;
      }
      toast.success('Pendaftaran berhasil. Cek email Anda untuk verifikasi sebelum login.');
      setMode('login');
    } catch (err: any) {
      toast.error('Gagal mendaftar: ' + (err?.message || 'kesalahan jaringan'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#FDFBF7]">
      {/* Panel brand — desktop */}
      <div className="relative hidden w-[46%] overflow-hidden bg-[#8CAA9A] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <img
          src="https://images.unsplash.com/photo-1544928147-79a2dbc1f389?crop=entropy&cs=srgb&fm=jpg&q=85"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-luminosity"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#8CAA9A]/70 via-[#8CAA9A]/85 to-[#6F8F7F]" />
        <div className="animate-fade-up relative">
          <div className="font-brand text-6xl font-bold tracking-[0.22em] text-white">DELORA</div>
          <div className="font-script mt-2 text-3xl text-[#E8D9B8]">Bloom &amp; Gift</div>
        </div>
        <p className="relative max-w-sm text-sm leading-relaxed text-white/85">
          Pembukuan artisan untuk usaha bouquet &amp; custom product — pesanan, stok, kas, dan aset dalam satu tempat
          yang tenang.
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="animate-fade-up w-full max-w-md">
        <div className="mb-8 text-center lg:hidden">
          <div className="font-brand text-5xl font-bold tracking-[0.22em] text-[#8CAA9A]">DELORA</div>
          <div className="font-script mt-1 text-2xl text-[#C9A227]">Bloom &amp; Gift</div>
        </div>
        <div className="card border-[#E6E2D8] p-6 shadow-[0_12px_32px_-4px_rgba(46,59,52,0.09)] sm:p-8" data-testid="login-card">
          {!supabaseConfigured && (
            <div
              className="mb-4 rounded-lg border border-[#ffe082] bg-[#fff8e1] px-3 py-2 text-xs text-[#8a6d00]"
              data-testid="supabase-config-warning"
            >
              Konfigurasi Supabase belum diisi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env.
            </div>
          )}
          <div className="mb-6 grid grid-cols-2 rounded-2xl bg-[#F2F7F4] p-1.5">
            <button
              onClick={() => setMode('login')}
              className={`min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-200 ${
                mode === 'login' ? 'bg-white text-[#2e3b34] shadow-sm' : 'text-[#5c6f64]'
              }`}
              data-testid="login-tab"
            >
              Masuk
            </button>
            <button
              onClick={() => setMode('register')}
              className={`min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-200 ${
                mode === 'register' ? 'bg-white text-[#2e3b34] shadow-sm' : 'text-[#5c6f64]'
              }`}
              data-testid="register-tab"
            >
              Daftar
            </button>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="label-base">Username</label>
                <input
                  className="input-base"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username Anda"
                  autoComplete="username"
                  data-testid="login-username-input"
                />
              </div>
              <div>
                <label className="label-base">Password</label>
                <input
                  type="password"
                  className="input-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  data-testid="login-password-input"
                />
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full" data-testid="login-submit-button">
                {busy ? 'Memproses…' : 'Masuk'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="label-base">Username</label>
                <input
                  className="input-base"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username unik"
                  autoComplete="username"
                  data-testid="register-username-input"
                />
              </div>
              <div>
                <label className="label-base">Email</label>
                <input
                  type="email"
                  className="input-base"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@contoh.com"
                  autoComplete="email"
                  data-testid="register-email-input"
                />
              </div>
              <div>
                <label className="label-base">Password</label>
                <input
                  type="password"
                  className="input-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  autoComplete="new-password"
                  data-testid="register-password-input"
                />
              </div>
              <p className="text-xs text-[#5c6f64]">
                Email wajib diverifikasi sebelum bisa login. Akun kas default (Cash, ATM, Tabungan, BRILINK) dibuat
                otomatis.
              </p>
              <button type="submit" disabled={busy} className="btn-primary w-full" data-testid="register-submit-button">
                {busy ? 'Memproses…' : 'Daftar'}
              </button>
            </form>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
