import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { Activity, Boxes, CircleHelp, Code2, Database, FlaskConical, LogOut, Search, Settings as SettingsIcon, UserRound, X } from 'lucide-react';
import { api, authApi, brainApi, onUnauthorized, setAccessToken } from './api';
import { connectRealtime, disconnectRealtime } from './realtime';
import type { User } from './types';
import { AuthPage } from './features/auth/AuthPage';
const WorkspacePage = lazy(() => import('./features/workspace/WorkspacePage').then((module) => ({ default: module.WorkspacePage })));
const LibraryPage = lazy(() => import('./features/library/LibraryPage').then((module) => ({ default: module.LibraryPage })));
const ExperimentsPage = lazy(() => import('./features/experiments/ExperimentsPage').then((module) => ({ default: module.ExperimentsPage })));
const DatafieldsPage = lazy(() => import('./features/datafields/DatafieldsPage').then((module) => ({ default: module.DatafieldsPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const ConnectPage = lazy(() => import('./features/brain/ConnectPage').then((module) => ({ default: module.ConnectPage })));

type Props = { queryClient: QueryClient };
export default function App({ queryClient }: Props) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    let mounted = true;
    authApi.refresh().then(() => {
      if (mounted) setAuthenticated(true);
    }).catch(() => {
      setAccessToken(null);
      if (mounted) setAuthenticated(false);
    }).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    onUnauthorized(() => {
      setAuthenticated(false);
      queryClient.clear();
      disconnectRealtime();
    });
    return () => onUnauthorized(null);
  }, [queryClient]);
  useEffect(() => {
    if (authenticated) connectRealtime(queryClient);
    else disconnectRealtime();
    return () => { if (!authenticated) disconnectRealtime(); };
  }, [authenticated, queryClient]);
  const signIn = () => { setAuthenticated(true); };
  const signOut = async () => {
    try { await authApi.logout(); } catch { /* local logout still clears in-memory credentials */ }
    setAccessToken(null);
    queryClient.clear();
    disconnectRealtime();
    setAuthenticated(false);
  };

  if (!ready) return <div className="boot-screen"><span className="brand-mark">ϟ</span><span>Opening your workspace…</span></div>;
  return <Suspense fallback={<div className="boot-screen"><span className="brand-mark">ϟ</span><span>Loading AlphaSim…</span></div>}><Routes>
    <Route path="/login" element={authenticated ? <Navigate to="/workspace" replace /> : <AuthPage mode="login" onSuccess={signIn} />} />
    <Route path="/register" element={authenticated ? <Navigate to="/workspace" replace /> : <AuthPage mode="register" onSuccess={signIn} />} />
    <Route element={<RequireAuth authenticated={authenticated} />}>
      <Route element={<AppShell onLogout={signOut} />}>
        <Route path="/workspace/:alphaId?" element={<WorkspacePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/experiments" element={<ExperimentsPage />} />
        <Route path="/datafields" element={<DatafieldsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="*" element={<Navigate to="/workspace" replace />} />
      </Route>
    </Route>
  </Routes></Suspense>;
}

function RequireAuth({ authenticated }: { authenticated: boolean }) {
  const location = useLocation();
  return authenticated ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}

function AppShell({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { data: userResponse } = useQuery({ queryKey: ['me'], queryFn: () => api<{ data: User }>('/users/me') });
  useEffect(() => { document.documentElement.dataset.theme = userResponse?.data.preferences?.theme === 'light' ? 'light' : 'dark'; }, [userResponse?.data.preferences?.theme]);
  const { data: brain } = useQuery({ queryKey: ['brain', 'status'], queryFn: brainApi.status, refetchInterval: (query) => query.state.data?.status === 'verification_pending' ? 3000 : false });
  useEffect(() => {
    if (brain?.status === 'none' && location.pathname !== '/connect') navigate('/connect', { replace: true });
  }, [brain?.status, location.pathname, navigate]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); }
      else if (event.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) { event.preventDefault(); setHelpOpen((open) => !open); }
      else if (event.key === 'Escape') { setHelpOpen(false); setPaletteOpen(false); setProfileOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const showReconnect = brain?.status === 'expired';
  const railItems = [
    { to: '/workspace', label: 'Workspace', icon: Code2 },
    { to: '/library', label: 'Library', icon: Boxes },
    { to: '/experiments', label: 'Experiments', icon: FlaskConical },
    { to: '/datafields', label: 'Datafields', icon: Database },
  ];
  return <div className="app-frame">
    <aside className="icon-rail" aria-label="Main navigation">
      <Link className="rail-logo" to="/workspace" aria-label="AlphaSim home"><span className="brand-mark">ϟ</span></Link>
      <nav className="rail-nav">{railItems.map(({ to, label, icon: Icon }) => <Link key={to} className={`rail-link ${(location.pathname.startsWith(to)) ? 'active' : ''}`} to={to} title={label}><Icon size={18} /><span>{label}</span></Link>)}</nav>
      <div className="rail-bottom">
        <button className="rail-icon" aria-label="Help and shortcuts" title="Help (?)" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /></button>
        <Link className={`rail-icon ${location.pathname === '/settings' ? 'active' : ''}`} to="/settings" aria-label="Settings"><SettingsIcon size={18} /></Link>
        <div className="profile-menu-wrap"><button className="user-avatar" onClick={() => setProfileOpen((open) => !open)} title="Account menu" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileOpen}>{userResponse?.data.displayName?.slice(0, 1).toUpperCase() ?? 'A'}</button>{profileOpen && <div className="profile-menu" role="menu"><div className="profile-menu-user"><strong>{userResponse?.data.displayName ?? 'AlphaSim user'}</strong><small>{userResponse?.data.email ?? 'Account details loading'}</small></div><Link to="/settings" role="menuitem" onClick={() => setProfileOpen(false)}><UserRound size={14} /> Account settings</Link><Link to="/connect" role="menuitem" onClick={() => setProfileOpen(false)}><Activity size={14} /> BRAIN connection</Link><button role="menuitem" onClick={onLogout}><LogOut size={14} /> Sign out</button></div>}</div>
      </div>
    </aside>
    <div className="app-column">
      {showReconnect && <div className="reconnect-banner" role="status"><Activity size={14} /> BRAIN session expired <button onClick={() => navigate('/connect')}>Reconnect</button></div>}
      <Outlet context={{ user: userResponse?.data, brain }} />
    </div>
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} onOpenDatafields={() => { setHelpOpen(false); navigate('/datafields?tab=operators'); }} />}
    {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(path) => { setPaletteOpen(false); navigate(path); }} />}
  </div>;
}

function HelpDialog({ onClose, onOpenDatafields }: { onClose: () => void; onOpenDatafields: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="standard-modal help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><header><strong id="help-title">AlphaSim help</strong><button className="icon-button" onClick={onClose} aria-label="Close help"><X size={17} /></button></header><div className="modal-content"><p>Write and validate Fast Expressions, then run them through your connected simulation provider. Forge AI suggestions are advisory; review every change before running it.</p><h3>Keyboard shortcuts</h3><dl className="shortcut-list"><div><dt>Run expression</dt><dd><kbd>⌘/Ctrl</kbd> + <kbd>Enter</kbd></dd></div><div><dt>Command palette</dt><dd><kbd>⌘/Ctrl</kbd> + <kbd>K</kbd></dd></div><div><dt>Save alpha version</dt><dd><kbd>⌘/Ctrl</kbd> + <kbd>S</kbd></dd></div><div><dt>Toggle Forge AI</dt><dd><kbd>⌘/Ctrl</kbd> + <kbd>/</kbd></dd></div><div><dt>Help</dt><dd><kbd>?</kbd></dd></div></dl><button className="btn btn-outline" onClick={onOpenDatafields}>Browse operator reference</button><p className="help-note">Simulation values are only as authoritative as the connected provider. Local mock results are labeled as mock.</p></div></section></div>;
}

function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (path: string) => void }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const commands = useMemo(() => [
    { label: 'Open workspace', path: '/workspace', hint: 'Workspace' },
    { label: 'Open alpha library', path: '/library', hint: 'Research' },
    { label: 'Open experiments', path: '/experiments', hint: 'Research tools' },
    { label: 'Browse datafields', path: '/datafields', hint: 'Catalog' },
    { label: 'Browse operators', path: '/datafields?tab=operators', hint: 'Fast Expression' },
    { label: 'Connect BRAIN', path: '/connect', hint: 'Provider' },
    { label: 'Open settings', path: '/settings', hint: 'Account' },
  ].filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(query.toLowerCase())), [query]);
  useEffect(() => setActiveIndex(0), [query]);
  return <div className="modal-backdrop command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette"><label><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => commands.length ? (index + 1) % commands.length : 0); } else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => commands.length ? (index - 1 + commands.length) % commands.length : 0); } else if (event.key === 'Enter' && commands[activeIndex]) { event.preventDefault(); onNavigate(commands[activeIndex].path); } }} placeholder="Search pages and commands…" aria-label="Search commands" aria-activedescendant={commands[activeIndex] ? `command-${activeIndex}` : undefined} /><kbd>ESC</kbd></label><div role="listbox" aria-label="Commands">{commands.length ? commands.map((item, index) => <button id={`command-${index}`} role="option" aria-selected={index === activeIndex} key={item.path} onMouseEnter={() => setActiveIndex(index)} onClick={() => onNavigate(item.path)}><span>{item.label}</span><small>{item.hint}</small></button>) : <p className="command-empty">No matching commands</p>}</div><footer><span>Navigate</span><kbd>↑</kbd><kbd>↓</kbd><span>Open</span><kbd>↵</kbd></footer></section></div>;
}

export type ShellContext = { user?: User; brain?: { status: string; mode?: string | null } };
export { AppShell };
