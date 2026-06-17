import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Gamepad2, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/store/AppContext';

export default function Login() {
  const { login, loginWithProvider } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (mode === 'signup' && !agree) return setError('Please accept the Terms and Privacy Policy.');
    setLoading(true);
    setTimeout(() => {
      login(email);
      navigate('/');
    }, 700);
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow">
            <Gamepad2 className="h-6 w-6 text-white" aria-hidden />
          </div>
          <span className="font-display text-xl tracking-wider text-white">GameHub</span>
        </div>
        <div className="relative z-10">
          <h1 className="text-gradient text-4xl font-display leading-tight">
            Your crew. <br /> One hub.
          </h1>
          <p className="mt-4 max-w-md text-slate-400">
            Chat like Discord, plan game nights, run tournaments, and share your best clips — all in
            one private space built for friend groups.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {['Voice & text chat', 'Session planner', 'Clip vault', 'Tournaments'].map((f) => (
              <span key={f} className="glass rounded-full px-3 py-1 text-xs text-slate-300">
                {f}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-600">© {new Date().getFullYear()} GameHub. For friends, by friends.</p>
        <div className="pointer-events-none absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="glass-strong w-full max-w-md rounded-3xl p-7 shadow-card"
        >
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent">
              <Gamepad2 className="h-5 w-5 text-white" aria-hidden />
            </div>
            <span className="font-display text-lg tracking-wider text-white">GameHub</span>
          </div>

          <h2 className="text-2xl font-display text-white">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {mode === 'signin' ? 'Sign in to jump back in.' : 'Join your friends on GameHub.'}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => loginWithProvider('google')} type="button">
              <GoogleIcon /> Google
            </Button>
            <Button variant="secondary" onClick={() => loginWithProvider('discord')} type="button">
              <DiscordIcon /> Discord
            </Button>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
            <span className="h-px flex-1 bg-white/10" /> or use email <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-3 text-white placeholder:text-slate-600 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-11 text-white placeholder:text-slate-600 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-white cursor-pointer"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <label className="flex items-start gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-primary"
                />
                <span>
                  I am 13 or older and agree to the{' '}
                  <Link to="/legal/terms" className="text-primary-soft underline">Terms</Link> and{' '}
                  <Link to="/legal/privacy" className="text-primary-soft underline">Privacy Policy</Link>.
                </span>
              </label>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-400">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => {
                setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
                setError(null);
              }}
              className="font-medium text-primary-soft hover:underline cursor-pointer"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.9 35.7 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#5865F2" aria-hidden>
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5c1.6.4 2.9 1 4.2 1.8-1.6-.8-3.4-1.3-5.2-1.5a18.6 18.6 0 0 0-4.4 0C8 4 6.2 4.5 4.6 5.3 5.9 4.5 7.2 3.9 8.8 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C1.3 8 0.6 11.5 0.8 15c1.7 1.3 3.4 2 5 2.6.4-.6.8-1.2 1.1-1.8-.6-.2-1.2-.5-1.7-.9l.4-.3c3.3 1.5 6.9 1.5 10.2 0l.4.3c-.5.4-1.1.7-1.7.9.3.6.7 1.2 1.1 1.8 1.7-.5 3.3-1.3 5-2.6.4-4.1-.7-7.6-2.3-10.6zM8.3 13c-1 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9zm7.4 0c-1 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9z" />
    </svg>
  );
}
