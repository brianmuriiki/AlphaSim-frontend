import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';
import { ApiError, authApi, setAccessToken } from '../../api';

export function AuthPage({ mode, onSuccess }: { mode: 'login' | 'register'; onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = mode === 'register';
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = isRegister
        ? await authApi.register({ email, password, displayName })
        : await authApi.login({ email, password });
      setAccessToken(response.data.accessToken);
      onSuccess();
      navigate((location.state as { from?: string } | null)?.from ?? '/workspace', { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'EMAIL_IN_USE' ? 'An account with this email already exists.' : 'Email or password could not be verified. Check your details and try again.');
    } finally { setBusy(false); }
  }
  return <main className="auth-screen">
    <div className="auth-glow" />
    <Link to="/login" className="auth-brand"><span className="brand-mark"><Zap size={18} fill="currentColor" /></span><span>AlphaSim</span><b>BETA</b></Link>
    <section className="auth-card">
      <div className="eyebrow">QUANT RESEARCH WORKSPACE</div>
      <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
      <p className="muted">{isRegister ? 'Build, test, and refine your alpha ideas.' : 'Sign in to return to your research workspace.'}</p>
      <form onSubmit={submit} className="auth-form">
        {isRegister && <label>Display name<input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} /></label>}
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></label>
        <label>Password<input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={isRegister ? 12 : 1} maxLength={128} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'} <ArrowRight size={15} /></button>
      </form>
      <div className="auth-switch">{isRegister ? 'Already have an account?' : 'New to AlphaSim?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></div>
    </section>
    <div className="auth-foot">Your research stays private and scoped to your account.</div>
  </main>;
}
