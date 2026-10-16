import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ExternalLink, LoaderCircle, ShieldCheck, Zap } from 'lucide-react';
import { ApiError, brainApi } from '../../api';

export function ConnectPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ['brain', 'status'], queryFn: brainApi.status, refetchInterval: (query) => query.state.data?.status === 'verification_pending' ? 3000 : false });
  const connect = useMutation({ mutationFn: brainApi.connect, onSuccess: async () => { setPassword(''); await queryClient.invalidateQueries({ queryKey: ['brain', 'status'] }); navigate('/workspace'); }, onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Could not connect to BRAIN. Try again.') });
  const disconnect = useMutation({ mutationFn: brainApi.disconnect, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['brain', 'status'] }); } });
  function submit(event: FormEvent) { event.preventDefault(); setError(''); connect.mutate({ email, password }); }
  return <main className="connect-page">
    <button className="back-link" onClick={() => navigate('/workspace')}><ArrowLeft size={15} /> Back to workspace</button>
    <section className="connect-card">
      <div className="connect-mark"><Zap size={22} fill="currentColor" /></div>
      <div className="eyebrow">DATA CONNECTION</div>
      <h1>{status.data?.status === 'connected' ? 'BRAIN is connected' : 'Connect your BRAIN account'}</h1>
      <p className="muted">Use your own account to submit alpha simulations and see provider results in AlphaSim.</p>
      {status.data?.status === 'connected' ? <div className="connection-active"><span className="status-dot positive" /><div><strong>Session healthy</strong><small>{status.data.mode === 'mock' ? 'Local mock provider' : 'BRAIN provider'} · {status.data.sessionExpiresAt ? `expires ${new Date(status.data.sessionExpiresAt).toLocaleString()}` : 'active'}</small></div><Check size={17} /></div> : <form className="auth-form connect-form" onSubmit={submit}>
        <label>BRAIN email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" maxLength={254} required /></label>
        <label>BRAIN password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" maxLength={512} required /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="privacy-note"><ShieldCheck size={15} /> Your password is sent once and cleared from this form.</div>
        <button className="btn btn-primary btn-full" disabled={connect.isPending}>{connect.isPending ? <><LoaderCircle className="spin" size={15} /> Connecting…</> : <>Connect BRAIN <ArrowRight size={15} /></>}</button>
      </form>}
      {status.data?.status === 'expired' && <div className="form-error">Your BRAIN session expired. Reconnect to continue submitting runs.</div>}
      {status.data?.status === 'verification_pending' && <div className="verification-card"><LoaderCircle className="spin" size={17} /><div><strong>Verification is pending</strong><small>Complete the verification in the BRAIN window, then return here.</small></div>{'url' in status.data && status.data.url && <a href={status.data.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>}</div>}
      {status.data?.status === 'connected' && <div className="connect-actions"><button className="btn btn-quiet" onClick={() => navigate('/workspace')}>Open workspace</button><button className="btn btn-outline" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>Disconnect</button></div>}
      <p className="connect-footnote">AlphaSim is an independent research workspace. Simulation metrics are provided by your connected data service.</p>
    </section>
  </main>;
}
