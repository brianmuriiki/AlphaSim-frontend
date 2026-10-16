import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Code2, Database, FileCode2, Folder, FolderOpen, History, Layers3, LoaderCircle, PanelLeftClose, Play, Plus, Search, Sparkles, Table2, X } from 'lucide-react';
import { alphaApi, ApiError, brainApi, catalogApi, folderApi, lintApi, simulationApi, userApi } from '../../api';
import { useLayout, useWorkspace } from '../../store';
import { defaultSettings, idOf, type Alpha, type AlphaVersion, type Folder as FolderItem, type LintResult, type Settings, type Simulation } from '../../types';
const EditorPane = lazy(() => import('./EditorPane').then((module) => ({ default: module.EditorPane })));
const ForgeAIPanel = lazy(() => import('../ai/ForgeAIPanel').then((module) => ({ default: module.ForgeAIPanel })));

export function WorkspacePage() {
  const { alphaId } = useParams(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const [search, setSearch] = useState(''); const [debouncedSearch, setDebouncedSearch] = useState(''); const [historyOpen, setHistoryOpen] = useState(false); const [compareOpen, setCompareOpen] = useState(false); const [compareIds, setCompareIds] = useState<string[]>([]); const [compareResult, setCompareResult] = useState<Simulation[]>([]); const [toast, setToast] = useState('');
  const [lintExpression, setLintExpression] = useState<string | null>(null);
  const aiOpen = useLayout((state) => state.aiOpen); const toggleAi = useLayout((state) => state.toggleAi); const libraryOpen = useLayout((state) => state.libraryOpen); const toggleLibrary = useLayout((state) => state.toggleLibrary);
  const openAlphaTabs = useLayout((state) => state.openAlphaTabs); const openTab = useLayout((state) => state.openTab); const closeTab = useLayout((state) => state.closeTab);
  const expression = useWorkspace((state) => state.expression); const settings = useWorkspace((state) => state.settings); const saveState = useWorkspace((state) => state.saveState);
  const setExpression = useWorkspace((state) => state.setExpression); const setSettings = useWorkspace((state) => state.setSettings); const setSaveState = useWorkspace((state) => state.setSaveState); const activeRunId = useWorkspace((state) => state.activeRunId); const setActiveRun = useWorkspace((state) => state.setActiveRun); const source = useWorkspace((state) => state.source); const consumeSource = useWorkspace((state) => state.consumeSource);
  const alphasQuery = useQuery({ queryKey: ['alphas', { q: debouncedSearch }], queryFn: () => alphaApi.list(debouncedSearch ? new URLSearchParams({ q: debouncedSearch }) : new URLSearchParams()) });
  const alphas = alphasQuery.data?.data ?? alphasQuery.data?.items ?? [];
  const foldersQuery = useQuery({ queryKey: ['folders'], queryFn: folderApi.list });
  const folders = foldersQuery.data?.data ?? [];
  const alphaQuery = useQuery({ queryKey: ['alpha', alphaId], queryFn: () => alphaApi.get(alphaId!), enabled: Boolean(alphaId) });
  const alpha = alphaQuery.data?.data;
  useEffect(() => { if (alphaId && alpha) openTab({ id: alphaId, name: alpha.name }); }, [alphaId, alpha?.name, openTab]);
  const brainQuery = useQuery({ queryKey: ['brain', 'status'], queryFn: brainApi.status });
  const userQuery = useQuery({ queryKey: ['me'], queryFn: userApi.me });
  const activeRunLimit = userQuery.data?.data.limits?.maxActiveRuns ?? 2;
  const runListQuery = useQuery({ queryKey: ['simulations', alphaId], queryFn: () => simulationApi.list(alphaId), enabled: Boolean(alphaId), refetchInterval: (query) => query.state.data?.items.some((run) => run.status === 'queued' || run.status === 'running') ? 5000 : false });
  const runs = runListQuery.data?.items ?? [];
  const activeRunQuery = useQuery({ queryKey: ['simulation', activeRunId], queryFn: () => simulationApi.get(activeRunId!), enabled: Boolean(activeRunId), refetchInterval: (query) => ['queued', 'running'].includes(query.state.data?.status ?? '') ? 5000 : false });
  const activeRun = activeRunQuery.data ?? runs.find((item) => idOf(item) === activeRunId);
  const lintQuery = useQuery({ queryKey: ['lint', lintExpression, settings], queryFn: () => lintApi.check(lintExpression ?? '', settings), enabled: lintExpression !== null && Boolean(alphaId), retry: false });
  const lint = lintExpression === expression ? lintQuery.data : undefined;
  const activeRuns = useMemo(() => runs.filter((run) => run.status === 'queued' || run.status === 'running').length, [runs]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loadedDraft = useRef({ alphaId: '', expression: '', settings: defaultSettings, saveState: 'saved' as string });

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!alphaId && alphas.length) navigate(`/workspace/${alphas[0]._id}`, { replace: true });
  }, [alphaId, alphas, navigate]);
  useEffect(() => {
    if (!alphaId || !alpha) return;
    if (loadedId !== alphaId) {
      const existingDraft = useWorkspace.getState();
      if (existingDraft.alphaId === alphaId) { setLoadedId(alphaId); return; }
      const nextSettings = { ...defaultSettings, ...(alpha.draft?.settings ?? alpha.currentVersion?.settings ?? {}) } as Settings;
      const nextExpression = alpha.draft?.expression ?? alpha.currentVersion?.expression ?? '';
      useWorkspace.getState().setAlpha(alphaId, nextExpression, nextSettings);
      loadedDraft.current = { alphaId, expression: nextExpression, settings: nextSettings, saveState: 'saved' };
      setLoadedId(alphaId);
      const latest = runs[0]; if (latest) setActiveRun(idOf(latest));
    }
  }, [alphaId, alpha, loadedId, runs, setActiveRun]);
  useEffect(() => {
    if (!alphaId || !alpha || loadedId !== alphaId) return;
    const timer = window.setTimeout(() => {
      if (saveState !== 'dirty') return;
      setSaveState('saving');
      alphaApi.saveDraft(alphaId, { expression, settings }).then(() => {
        const current = useWorkspace.getState();
        if (current.alphaId === alphaId && current.expression === expression && JSON.stringify(current.settings) === JSON.stringify(settings)) {
          loadedDraft.current = { alphaId, expression, settings, saveState: 'saved' };
          setSaveState('saved');
        }
      }).catch(() => {
        const current = useWorkspace.getState();
        if (current.alphaId === alphaId && current.expression === expression && JSON.stringify(current.settings) === JSON.stringify(settings)) setSaveState('error');
      });
    }, saveState === 'dirty' ? 2000 : 0);
    return () => window.clearTimeout(timer);
  }, [alphaId, alpha, loadedId, expression, settings, saveState, setSaveState]);
  useEffect(() => { loadedDraft.current = { alphaId: alphaId ?? '', expression, settings, saveState }; }, [alphaId, expression, settings, saveState]);
  useEffect(() => {
    const id = alphaId;
    return () => {
      const draft = loadedDraft.current;
      if (id && draft.alphaId === id && draft.saveState === 'dirty') void alphaApi.saveDraft(id, { expression: draft.expression, settings: draft.settings }).catch(() => undefined);
    };
  }, [alphaId]);
  useEffect(() => { if (lintExpression !== expression) { const timer = window.setTimeout(() => setLintExpression(expression), 400); return () => window.clearTimeout(timer); } }, [expression, lintExpression]);
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(''), 3500); return () => window.clearTimeout(timer); } }, [toast]);
  useEffect(() => { const timer = window.setTimeout(() => { void queryClient.invalidateQueries({ queryKey: ['simulations', alphaId] }); }, 5000); return () => window.clearTimeout(timer); }, [activeRun?.status, alphaId, queryClient]);

  const saveVersion = useMutation({ mutationFn: () => alphaApi.saveVersion(alphaId!, { expression, settings, source }), onSuccess: async () => { consumeSource(); setSaveState('saved'); await Promise.all([queryClient.invalidateQueries({ queryKey: ['versions', alphaId] }), queryClient.invalidateQueries({ queryKey: ['alpha', alphaId] })]); setToast('Version saved.'); }, onError: () => setToast('Could not save the version. Try again.') });
  const runMutation = useMutation({ mutationFn: () => simulationApi.run({ alphaId: alphaId!, expression, settings, source }), onSuccess: async (run) => { consumeSource(); setActiveRun(run.id); await Promise.all([queryClient.invalidateQueries({ queryKey: ['simulations', alphaId] }), queryClient.invalidateQueries({ queryKey: ['versions', alphaId] }), queryClient.invalidateQueries({ queryKey: ['alpha', alphaId] })]); }, onError: (error) => handleRunError(error, navigate, setToast) });
  const createAlpha = useMutation({ mutationFn: () => alphaApi.create({ name: 'Untitled Alpha', expression: '', settings: defaultSettings }), onSuccess: (result) => { openTab({ id: result.data._id, name: result.data.name }); void queryClient.invalidateQueries({ queryKey: ['alphas'] }); navigate(`/workspace/${result.data._id}`); }, onError: (error) => setToast(formatCreateError(error)) });
  const createFolder = useMutation({ mutationFn: () => folderApi.create('New folder'), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['folders'] }) });
  const compare = useMutation({ mutationFn: () => simulationApi.compare(compareIds), onSuccess: (data) => setCompareResult(data.data) });
  const versionsQuery = useQuery({ queryKey: ['versions', alphaId], queryFn: () => alphaApi.versions(alphaId!), enabled: historyOpen && Boolean(alphaId) });
  const canRun = Boolean(alphaId) && brainQuery.data?.status === 'connected' && !runMutation.isPending && !lintQuery.isLoading && Boolean(lint) && !lint?.errors.length && activeRuns < activeRunLimit;
  const saveText = saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved · Retry' : 'Unsaved';

  const run = useCallback(() => {
    if (!alphaId) return;
    if (brainQuery.data?.status !== 'connected') { navigate('/connect'); return; }
    if (activeRuns >= activeRunLimit) { setToast('Wait for a current run to finish.'); return; }
    if (lintQuery.isLoading || !lint) { setToast('Checking expression before run…'); return; }
    if (lint.errors.length) { setToast(`Fix ${lint.errors.length} expression error${lint.errors.length === 1 ? '' : 's'} before running.`); return; }
    runMutation.mutate();
  }, [alphaId, brainQuery.data?.status, navigate, activeRuns, activeRunLimit, lintQuery.isLoading, lint, runMutation]);
  const saveDraftNow = useCallback(() => {
    if (saveState === 'error' && alphaId) { setSaveState('dirty'); void alphaApi.saveDraft(alphaId, { expression, settings }).then(() => setSaveState('saved')).catch(() => setSaveState('error')); }
  }, [saveState, alphaId, expression, settings, setSaveState]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key === 'Enter') { event.preventDefault(); run(); }
      else if (modifier && event.key === '/') { event.preventDefault(); toggleAi(); }
      else if (modifier && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleLibrary(); }
      else if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); if (alphaId) saveVersion.mutate(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [run, toggleAi, toggleLibrary, alphaId, saveVersion]);
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (saveState !== 'saved') { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [saveState]);

  if (!alphaId && alphasQuery.isLoading) return <div className="workspace-loading"><LoaderCircle className="spin" /> Loading your library…</div>;
  if (!alphaId && !alphas.length) return <div className="workspace-view"><TopBar title="Workspace" saveText="Saved" onRun={() => undefined} runDisabled /><div className="first-alpha"><div className="empty-art"><Code2 size={34} /></div><span className="eyebrow">YOUR RESEARCH STARTS HERE</span><h1>Create your first alpha</h1><p>Write a Fast Expression, check it as you type, and run it through your connected provider.</p><button className="btn btn-primary" onClick={() => createAlpha.mutate()} disabled={createAlpha.isPending}><Plus size={15} /> {createAlpha.isPending ? 'Creating…' : 'Create alpha'}</button>{brainQuery.data?.status !== 'connected' && <button className="btn btn-quiet" onClick={() => navigate('/connect')}>Connect BRAIN first <ChevronRight size={14} /></button>}</div>{toast && <div className="toast" role="alert"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}</div>;
  if (alphaId && alphaQuery.isLoading) return <div className="workspace-loading"><LoaderCircle className="spin" /> Loading alpha…</div>;
  if (alphaId && alphaQuery.isError) return <div className="workspace-loading error-state"><AlertTriangle size={18} /> This alpha is unavailable. <Link to="/library">Return to the library</Link></div>;

  return <div className="workspace-view">
    <header className="topbar">
      <div className="topbar-breadcrumb"><button className="panel-toggle" onClick={toggleLibrary} title="Toggle library"><PanelLeftClose size={16} /></button><span className="crumb-parent">{folders.find((folder) => folder._id === alpha?.folderId)?.name ?? 'Momentum'}</span><ChevronRight size={13} /><strong>{alpha?.name ?? 'Workspace'}</strong><span className={`save-dot ${saveState}`} /><button className={`save-label ${saveState === 'error' ? 'error' : ''}`} onClick={saveDraftNow}>{saveText}</button></div>
      <div className="topbar-actions"><button className="top-action" onClick={() => setHistoryOpen(true)}><History size={17} /><span>History</span></button><button className="top-action" onClick={() => { setCompareOpen(true); setCompareResult([]); }}><Table2 size={16} /><span>Compare</span></button><button className="btn btn-primary run-button" disabled={!canRun} title={runTitle(canRun, brainQuery.data?.status, lint, activeRuns, activeRunLimit)} onClick={() => run()}>{runMutation.isPending ? <LoaderCircle size={15} className="spin" /> : <Play size={14} fill="currentColor" />}<span>Run</span><kbd>⌘↵</kbd></button></div>
    </header>
    {brainQuery.data?.status === 'expired' && <div className="inline-reconnect"><AlertTriangle size={14} /> BRAIN session expired. <button onClick={() => navigate('/connect')}>Reconnect</button></div>}
    <div className={`workspace-grid ${libraryOpen ? '' : 'library-collapsed'} ${aiOpen ? '' : 'ai-collapsed'}`}>
      {libraryOpen && <LibraryPanel alphas={alphas} folders={folders} activeId={alphaId ?? ''} brainStatus={brainQuery.data?.status ?? 'none'} search={search} setSearch={setSearch} onCreate={() => createAlpha.mutate()} onCreateFolder={() => createFolder.mutate()} onSelect={(id) => navigate(`/workspace/${id}`)} onOpenDatafields={() => navigate('/datafields')} onOpenOperators={() => navigate('/datafields?tab=operators')} loading={alphasQuery.isLoading} total={alphasQuery.data?.meta?.total ?? alphas.length} />}
      <Suspense fallback={<div className="editor-column workspace-loading"><LoaderCircle className="spin" /> Loading editor…</div>}><EditorPane expression={expression} settings={settings} onChange={setExpression} onSettings={setSettings} lint={lint} linting={lintQuery.isLoading || lintExpression !== expression} lintError={lintQuery.isError} onShowHistory={() => setHistoryOpen(true)} alphaTabs={openAlphaTabs} activeAlphaId={alphaId ?? ''} onSelectTab={(id) => navigate(`/workspace/${id}`)} onCloseTab={(id) => { const index = openAlphaTabs.findIndex((tab) => tab.id === id); const next = openAlphaTabs[index + 1] ?? openAlphaTabs[index - 1]; closeTab(id); if (id === alphaId && next) navigate(`/workspace/${next.id}`); }} onAddTab={() => createAlpha.mutate()} dirty={saveState !== 'saved'} onOpenOperators={() => navigate('/datafields?tab=operators')} /></Suspense>
      {aiOpen && alphaId && <Suspense fallback={<div className="ai-panel workspace-loading"><LoaderCircle className="spin" /> Loading Forge AI…</div>}><ForgeAIPanel key={alphaId} alphaId={alphaId} alphaName={alpha?.name ?? 'Alpha'} run={activeRun} onClose={toggleAi} showToast={setToast} /></Suspense>}
    </div>
    {!aiOpen && <button className="open-ai-tab" onClick={toggleAi}><Sparkles size={15} /> Forge AI</button>}
    {toast && <div className="toast" role="status"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}
    {historyOpen && <HistoryDialog runs={runs} versions={versionsQuery.data?.data ?? []} loading={versionsQuery.isLoading} onClose={() => setHistoryOpen(false)} onSelectRun={(runId) => { setActiveRun(runId); setHistoryOpen(false); }} onRestore={async (version) => { if (!alphaId) return; const restored = await alphaApi.restore(alphaId, version.versionNumber); useWorkspace.getState().setAlpha(alphaId, restored.data.expression, { ...defaultSettings, ...restored.data.settings }); setHistoryOpen(false); await Promise.all([queryClient.invalidateQueries({ queryKey: ['alpha', alphaId] }), queryClient.invalidateQueries({ queryKey: ['versions', alphaId] })]); setToast(`Restored version #${version.versionNumber} as a new version.`); }} />}
    {compareOpen && <CompareDialog runs={runs} selected={compareIds} setSelected={setCompareIds} result={compareResult} loading={compare.isPending} onCompare={() => compare.mutate()} onClose={() => setCompareOpen(false)} />}
  </div>;
}

function TopBar({ title, saveText, onRun, runDisabled }: { title: string; saveText: string; onRun: () => void; runDisabled: boolean }) {
  return <header className="topbar"><div className="topbar-breadcrumb"><strong>{title}</strong><span className="save-dot saved" /><span className="save-label">{saveText}</span></div><div className="topbar-actions"><button className="btn btn-primary run-button" disabled={runDisabled} onClick={onRun}><Play size={14} fill="currentColor" /><span>Run</span></button></div></header>;
}

function LibraryPanel({ alphas, folders, activeId, brainStatus, search, setSearch, onCreate, onCreateFolder, onSelect, onOpenDatafields, onOpenOperators, loading, total }: { alphas: Alpha[]; folders: FolderItem[]; activeId: string; brainStatus: string; search: string; setSearch: (value: string) => void; onCreate: () => void; onCreateFolder: () => void; onSelect: (id: string) => void; onOpenDatafields: () => void; onOpenOperators: () => void; loading: boolean; total: number }) {
  const navigate = useNavigate(); const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { data: fields } = useQuery({ queryKey: ['datafields', 'count'], queryFn: () => catalogApi.datafields(new URLSearchParams({ limit: '1' })), staleTime: 300_000 });
  const { data: operators } = useQuery({ queryKey: ['operators'], queryFn: catalogApi.operators, staleTime: 1_800_000 });
  const folderRoot = folders.filter((folder) => !folder.parentId);
  const childAlphas = (folderId: string | null) => alphas.filter((alpha) => (alpha.folderId ?? null) === folderId);
  const toggleFolder = (id: string) => setExpanded((state) => ({ ...state, [id]: !state[id] }));
  const renderFolder = (folder: FolderItem): ReactNode => <div className="tree-folder" key={folder._id}><button className="tree-folder-row" role="treeitem" aria-expanded={Boolean(expanded[folder._id])} onClick={() => toggleFolder(folder._id)} onKeyDown={(event) => { if (event.key === 'ArrowRight' && !expanded[folder._id]) { event.preventDefault(); toggleFolder(folder._id); } else if (event.key === 'ArrowLeft' && expanded[folder._id]) { event.preventDefault(); toggleFolder(folder._id); } }}>{expanded[folder._id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Folder size={15} /><span>{folder.name}</span><small>{folder.alphaCount ?? childAlphas(folder._id).length}</small></button>{expanded[folder._id] && <div role="group">{folders.filter((child) => child.parentId === folder._id).map(renderFolder)}{childAlphas(folder._id).map((alpha) => <AlphaTreeItem key={alpha._id} alpha={alpha} active={alpha._id === activeId} onClick={() => onSelect(alpha._id)} />)}</div>}</div>;
  return <aside className="library-panel">
    <div className="library-heading"><span>ALPHA LIBRARY</span><button className="icon-button" onClick={onCreateFolder} title="New folder"><Plus size={17} /></button></div>
    <label className="search-box"><Search size={15} /><input id="alpha-search" placeholder="Search alphas" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘K</kbd></label>
    <div className="alpha-tree" role="tree" aria-label="Alpha library" onKeyDown={(event) => { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return; const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')); const current = items.indexOf(document.activeElement as HTMLElement); const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))); if (items[target]) { event.preventDefault(); items[target].focus(); } }}>
      {loading ? <div className="tree-state"><LoaderCircle size={14} className="spin" /> Loading alphas…</div> : <>
        {folderRoot.map(renderFolder)}
        {childAlphas(null).map((alpha) => <AlphaTreeItem key={alpha._id} alpha={alpha} active={alpha._id === activeId} onClick={() => onSelect(alpha._id)} />)}
        {!alphas.length && <div className="tree-empty">No alphas match. <button onClick={onCreate}>Create one</button></div>}
      </>}
    </div>
    <div className="quick-access"><div className="section-label">QUICK ACCESS</div><button onClick={onOpenDatafields}><Database size={15} /><span>Datafields</span><small>{fields?.total?.toLocaleString() ?? '—'}</small></button><button onClick={onOpenOperators}><Layers3 size={15} /><span>Operators</span><small>{operators?.count?.toLocaleString() ?? '—'}</small></button><button className="browse-library" onClick={() => navigate('/library')}><FolderOpen size={14} /> Browse all {total > 0 ? `· ${total}` : ''}</button></div>
    <div className="library-footer"><span className={`status-dot ${brainStatus === 'connected' ? 'positive' : brainStatus === 'expired' ? 'negative' : 'amber'}`} /> <span>BRAIN {brainStatus === 'connected' ? 'connected' : brainStatus === 'expired' ? 'expired' : 'not connected'}</span><button onClick={() => navigate('/connect')}>Manage</button></div>
  </aside>;
}

function AlphaTreeItem({ alpha, active, onClick }: { alpha: Alpha; active: boolean; onClick: () => void }) {
  return <button role="treeitem" aria-selected={active} className={`alpha-tree-item ${active ? 'selected' : ''}`} onClick={onClick}><FileCode2 size={14} /><span>{alpha.name}</span>{alpha.bestMetrics?.sharpe !== undefined ? <small>{alpha.bestMetrics.sharpe.toFixed(1)}</small> : <i className="unsaved-indicator" />}</button>;
}

function HistoryDialog({ runs, versions, loading, onClose, onSelectRun, onRestore }: { runs: Simulation[]; versions: AlphaVersion[]; loading: boolean; onClose: () => void; onSelectRun: (id: string) => void; onRestore: (version: AlphaVersion) => void }) {
  const [tab, setTab] = useState<'Runs' | 'Versions'>('Runs');
  return <Modal title="History" onClose={onClose}><div className="dialog-tabs">{(['Runs', 'Versions'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>
    {tab === 'Runs' ? <div className="history-list">{runs.length ? runs.map((run) => <button key={idOf(run)} className="history-row" onClick={() => onSelectRun(idOf(run))}><span className={`status-dot ${run.status === 'completed' ? 'positive' : run.status === 'failed' ? 'negative' : 'amber'}`} /><div><strong>Run #{run.runNumber}</strong><small>{new Date(run.timing?.queuedAt ?? '').toLocaleString()} · {run.status}</small></div><b>{run.result?.sharpe?.toFixed(2) ?? '—'}</b></button>) : <EmptyNotice title="No runs yet" detail="Runs for this alpha will show here." />}</div> : loading ? <div className="state-row"><LoaderCircle size={15} className="spin" /> Loading versions…</div> : <div className="history-list">{versions.length ? versions.map((version) => <div className="version-row" key={version._id}><div><strong>Version #{version.versionNumber}</strong><small>{version.source ?? 'manual'} · {new Date(version.createdAt).toLocaleString()}</small><code>{version.expression.slice(0, 96) || 'Empty expression'}</code></div><button className="btn btn-outline btn-sm" onClick={() => onRestore(version)}>Restore</button></div>) : <EmptyNotice title="No saved versions" detail="Save a version from the workspace to create a snapshot." />}</div>}
    <div className="dialog-footnote">Restoring a version creates a new snapshot so run history stays reproducible.</div>
  </Modal>;
}

function CompareDialog({ runs, selected, setSelected, result, loading, onCompare, onClose }: { runs: Simulation[]; selected: string[]; setSelected: (ids: string[]) => void; result: Simulation[]; loading: boolean; onCompare: () => void; onClose: () => void }) {
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : selected.length < 5 ? [...selected, id] : selected);
  return <Modal title="Compare runs" onClose={onClose}><p className="modal-help">Choose 2–5 completed runs from this alpha.</p><div className="compare-picker">{runs.filter((run) => run.status === 'completed').map((run) => <label key={idOf(run)}><input type="checkbox" checked={selected.includes(idOf(run))} onChange={() => toggle(idOf(run))} /><span>Run #{run.runNumber}</span><small>Sharpe {run.result?.sharpe?.toFixed(2) ?? '—'}</small><small>{new Date(run.timing?.finishedAt ?? '').toLocaleDateString()}</small></label>)}</div><button className="btn btn-primary" disabled={selected.length < 2 || loading} onClick={onCompare}>{loading ? 'Comparing…' : 'Compare selected'}</button>{result.length > 0 && <div className="compare-table-wrap"><table><thead><tr><th>Metric</th>{result.map((run) => <th key={idOf(run)}>Run #{run.runNumber}</th>)}</tr></thead><tbody>{(['sharpe', 'fitness', 'turnover', 'returns', 'drawdown', 'margin'] as const).map((metric) => <tr key={metric}><td>{metric}</td>{result.map((run) => <td key={idOf(run)}>{formatMetric(run.result?.[metric], metric)}</td>)}</tr>)}</tbody></table></div>}</Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="standard-modal" role="dialog" aria-modal="true" aria-label={title}><header><strong>{title}</strong><button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></header><div className="modal-content">{children}</div></section></div>;
}
function EmptyNotice({ title, detail }: { title: string; detail: string }) { return <div className="empty-notice"><strong>{title}</strong><span>{detail}</span></div>; }
function formatCreateError(error: unknown) {
  if (!(error instanceof ApiError)) return 'Could not create this alpha. Check the backend terminal and try again.';
  if (Array.isArray(error.details)) {
    const fields = error.details.map((detail) => typeof detail === 'object' && detail !== null && 'path' in detail ? String(detail.path) : typeof detail === 'object' && detail !== null && 'message' in detail ? String(detail.message) : '').filter(Boolean);
    if (fields.length) return `Could not create alpha: ${error.code} · ${fields.join(', ')}`;
  }
  return `Could not create alpha: ${error.message || error.code}`;
}
function handleRunError(error: unknown, navigate: ReturnType<typeof useNavigate>, setToast: (message: string) => void) {
  if (error instanceof ApiError) {
    if (error.code === 'BRAIN_NOT_CONNECTED') { navigate('/connect'); return; }
    if (error.code === 'INVALID_EXPRESSION' && Array.isArray(error.details)) { setToast(`Fix ${error.details.length} expression errors before running.`); return; }
    if (error.code === 'TOO_MANY_ACTIVE') { setToast('Wait for a current run to finish.'); return; }
    setToast(error.message || error.code); return;
  }
  setToast('The run could not be queued. Check your connection and try again.');
}
function runTitle(canRun: boolean, brainStatus?: string, lint?: LintResult, activeRuns = 0, activeRunLimit = 2) {
  if (brainStatus !== 'connected') return 'Connect BRAIN to run';
  if (lint?.errors.length) return `Fix ${lint.errors.length} errors first`;
  if (activeRuns >= activeRunLimit) return 'Wait for an active run to finish';
  if (!canRun) return 'Checking expression…';
  return 'Run simulation (⌘↵)';
}
function formatMetric(value: number | undefined, metric: string) { if (typeof value !== 'number') return '—'; return ['returns', 'turnover', 'drawdown'].includes(metric) ? `${(value * 100).toFixed(1)}%` : metric === 'margin' ? `${(value * 1000).toFixed(1)}‰` : value.toFixed(2); }
