import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor, languages, Position } from 'monaco-editor';
import { Check, ChevronDown, ChevronRight, CircleAlert, Clock3, FileCode2, LoaderCircle, Plus, Settings2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { catalogApi, simulationApi } from '../../api';
import type { Datafield, LintResult, Metrics, Operator, RunCheck, Settings, Simulation } from '../../types';
import { useWorkspace } from '../../store';
const PnlChart = lazy(() => import('./PnlChart').then((module) => ({ default: module.PnlChart })));

let languageRegistered = false;
let completionProviderRegistered = false;
let hoverProviderRegistered = false;
let signatureProviderRegistered = false;
let latestOperators: Operator[] = [];
let latestFields: Datafield[] = [];
function setupLanguage(monaco: typeof import('monaco-editor')) {
  if (languageRegistered) return;
  languageRegistered = true;
  monaco.languages.register({ id: 'fast-expression' });
  monaco.languages.setMonarchTokensProvider('fast-expression', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/[a-zA-Z_][\w.]*(?=\s*\()/, 'function'],
        [/[a-zA-Z_][\w.]*/, 'identifier'],
        [/-?\d+(?:\.\d+)?/, 'number'],
        [/[=+\-*/%^<>!]+/, 'operator'],
        [/[(),;]/, 'delimiter'],
      ],
    },
  });
  monaco.editor.defineTheme('alphasim-dark', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '568273', fontStyle: 'italic' },
      { token: 'function', foreground: 'F1B34C' },
      { token: 'identifier', foreground: '56C2B1' },
      { token: 'number', foreground: 'E99A75' },
      { token: 'operator', foreground: 'D7DADD' },
    ],
    colors: { 'editor.background': '#111414', 'editorLineNumber.foreground': '#4e5755', 'editorLineNumber.activeForeground': '#92aaa5', 'editorCursor.foreground': '#f0b64a', 'editor.selectionBackground': '#34443f88', 'editor.lineHighlightBackground': '#151919' },
  });
  monaco.editor.defineTheme('alphasim-light', { base: 'vs', inherit: true, rules: [{ token: 'comment', foreground: '527f73', fontStyle: 'italic' }, { token: 'function', foreground: '9a620a' }, { token: 'identifier', foreground: '167c70' }, { token: 'number', foreground: 'a84a24' }, { token: 'operator', foreground: '303735' }], colors: { 'editor.background': '#f7f8f6', 'editorLineNumber.foreground': '#9aa39f', 'editorLineNumber.activeForeground': '#52605b', 'editorCursor.foreground': '#b77a14', 'editor.selectionBackground': '#cbd9d388', 'editor.lineHighlightBackground': '#edf1ee' } });
}

type Props = { expression: string; settings: Settings; onChange: (value: string) => void; onSettings: (value: Settings) => void; lint?: LintResult; linting: boolean; lintError?: boolean; onShowHistory: () => void; alphaTabs: { id: string; name: string }[]; activeAlphaId: string; onSelectTab: (id: string) => void; onCloseTab: (id: string) => void; onAddTab: () => void; dirty: boolean; onOpenOperators: () => void };
export function EditorPane({ expression, settings, onChange, onSettings, lint, linting, lintError = false, onShowHistory, alphaTabs, activeAlphaId, onSelectTab, onCloseTab, onAddTab, dirty, onOpenOperators }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<editor.ITextModel | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const { data: operatorData } = useQuery({ queryKey: ['operators'], queryFn: catalogApi.operators, staleTime: 30 * 60_000 });
  const fieldParams = new URLSearchParams({ region: settings.region, universe: settings.universe, delay: String(settings.delay), limit: '100' });
  const { data: fieldData } = useQuery({ queryKey: ['datafields', settings.region, settings.universe, settings.delay], queryFn: () => catalogApi.datafields(fieldParams), staleTime: 30 * 60_000 });
  useEffect(() => { latestOperators = operatorData?.items ?? []; }, [operatorData]);
  useEffect(() => { latestFields = fieldData?.items ?? []; }, [fieldData]);

  const onMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    modelRef.current = editorInstance.getModel();
    monacoRef.current = monaco;
    setupLanguage(monaco);
    monaco.editor.setModelLanguage(editorInstance.getModel()!, 'fast-expression');
    editorInstance.onDidChangeCursorPosition((event) => setCursor({ line: event.position.lineNumber, column: event.position.column }));
    if (!completionProviderRegistered) monaco.languages.registerCompletionItemProvider('fast-expression', {
      triggerCharacters: ['_', '.'],
      provideCompletionItems(model: editor.ITextModel, position: Position) {
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
        const operators = latestOperators;
        const fields = latestFields;
        const suggestions: languages.CompletionItem[] = [
          ...operators.map((operator) => ({ label: operator.name, kind: monaco.languages.CompletionItemKind.Function, detail: operator.signature, documentation: operator.description, insertText: `${operator.name}($0)`, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range })),
          ...fields.map((field) => ({ label: field.name, kind: monaco.languages.CompletionItemKind.Field, detail: field.type, documentation: field.description, insertText: field.name, range })),
        ];
        return { suggestions };
      },
    });
    completionProviderRegistered = true;
    if (!hoverProviderRegistered) monaco.languages.registerHoverProvider('fast-expression', {
      provideHover(model: editor.ITextModel, position: Position) {
        const word = model.getWordAtPosition(position); if (!word) return null;
        const operator = latestOperators.find((item) => item.name === word.word);
        if (operator) return { contents: [{ value: `**${operator.name}** · ${operator.signature}\n\n${operator.description}` }] };
        const field = latestFields.find((item) => item.name === word.word);
        if (field) return { contents: [{ value: `**${field.name}** · ${field.type}\n\n${field.description}` }] };
        return null;
      },
    });
    hoverProviderRegistered = true;
    if (!signatureProviderRegistered) monaco.languages.registerSignatureHelpProvider('fast-expression', {
      signatureHelpTriggerCharacters: ['(', ','],
      provideSignatureHelp(model: editor.ITextModel, position: Position) {
        const before = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
        const match = before.match(/([a-zA-Z_]\w*)\(([^()]*)$/); if (!match) return null;
        const operator = latestOperators.find((item) => item.name === match[1]); if (!operator) return null;
        const signature = operator.signature ?? `${operator.name}()`;
        const parameters = signature.slice(signature.indexOf('(') + 1, -1).split(',').map((name) => name.trim()).filter(Boolean);
        return { value: { signatures: [{ label: signature, documentation: operator.description, parameters: parameters.map((label) => ({ label })) }], activeSignature: 0, activeParameter: match[2].trim() ? match[2].split(',').length - 1 : 0 }, dispose() {} };
      },
    });
    signatureProviderRegistered = true;
  };

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const monaco = monacoRef.current;
    if (!monaco) return;
    const markers = [
      ...(lint?.errors ?? []).map((issue) => ({ startLineNumber: issue.line, endLineNumber: issue.line, startColumn: issue.col, endColumn: issue.col + 1, message: issue.message, severity: monaco.MarkerSeverity.Error })),
      ...(lint?.warnings ?? []).map((issue) => ({ startLineNumber: issue.line, endLineNumber: issue.line, startColumn: issue.col, endColumn: issue.col + 1, message: issue.message, severity: monaco.MarkerSeverity.Warning })),
    ];
    monaco.editor.setModelMarkers(model, 'alphasim', markers);
  }, [lint]);

  const issueCount = (lint?.errors.length ?? 0) + (lint?.warnings.length ?? 0);
  const issueLabel = linting ? 'Checking…' : lintError ? 'Lint unavailable' : issueCount ? `${lint?.errors.length ?? 0} errors · ${lint?.warnings.length ?? 0} warnings` : 'No issues';
  const settingOptions = useMemo(() => ({
    region: ['USA', 'EUR', 'ASI', 'CHN', 'IND', 'GLB'],
    universe: ['TOP3000', 'TOP1000', 'TOP500', 'TOP200', 'MINVOL1M'],
    neutralization: ['SUBINDUSTRY', 'INDUSTRY', 'SECTOR', 'MARKET', 'NONE'],
    pasteurization: ['ON', 'OFF'], nanHandling: ['OFF', 'ON'],
  }), []);
  function update<K extends keyof Settings>(key: K, value: Settings[K]) { onSettings({ ...settings, [key]: value }); }

  return <section className="editor-column">
    <div className="editor-tabbar"><div className="alpha-editor-tabs" role="tablist" aria-label="Open alpha editors">{alphaTabs.map((tab) => <div className="alpha-editor-tab" key={tab.id}><button role="tab" aria-selected={activeAlphaId === tab.id} tabIndex={activeAlphaId === tab.id ? 0 : -1} className={`file-tab ${activeAlphaId === tab.id ? 'active' : ''}`} onClick={() => onSelectTab(tab.id)} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const index = alphaTabs.findIndex((item) => item.id === tab.id); const step = event.key === 'ArrowRight' ? 1 : -1; onSelectTab(alphaTabs[(index + step + alphaTabs.length) % alphaTabs.length].id); } }}><FileCode2 size={13} /><span>{tab.name}</span>{activeAlphaId === tab.id && dirty && <span className="tab-dirty" />}</button><button className="tab-close" aria-label={`Close ${tab.name}`} disabled={alphaTabs.length < 2} onClick={() => onCloseTab(tab.id)}><X size={12} /></button></div>)}</div><button className="tab-add" aria-label="Create alpha editor" title="Create alpha" onClick={onAddTab}><Plus size={15} /></button><div className="language-indicator"><button className="language-menu-button" onClick={() => editorRef.current?.trigger('toolbar', 'editor.action.startFindReplaceAction', null)}>Find / Replace</button><button className="language-menu-button" onClick={onOpenOperators}>Fast Expression · Operators</button></div></div>
    <div className="code-editor-wrap">
      <Editor height="100%" language="fast-expression" theme={document.documentElement.dataset.theme === 'light' ? 'alphasim-light' : 'alphasim-dark'} value={expression} onChange={(value) => onChange(value ?? '')} onMount={onMount} options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, fontFamily: 'JetBrains Mono, ui-monospace, monospace', lineHeight: 29, padding: { top: 20, bottom: 24 }, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, renderLineHighlight: 'line', overviewRulerBorder: false, hideCursorInOverviewRuler: true, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }, suggest: { preview: true }, quickSuggestions: true, ariaLabel: 'Fast Expression editor' }} />
    </div>
    <div className="editor-statusbar"><span>Ln {cursor.line}, Col {cursor.column}</span><span className={lintError || lint?.errors.length ? 'negative-text' : ''}>{linting ? <LoaderCircle size={12} className="spin" /> : lintError || lint?.errors.length ? <CircleAlert size={12} /> : <Check size={12} />} {issueLabel}</span><span>UTF-8</span><span>Spaces: 2</span></div>
    {lintError && !linting && <div className="lint-unavailable" role="status">Unable to reach the lint service. Reconnect or try again before running this expression.</div>}
    <button className="settings-toggle" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>{settingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Settings2 size={15} /><span>Simulation settings</span><small>{settings.region} · {settings.universe} · Delay {settings.delay}</small></button>
    {settingsOpen && <div className="settings-grid">
      {(['region', 'universe', 'delay', 'decay', 'neutralization', 'truncation', 'pasteurization', 'nanHandling'] as const).map((key) => <label key={key}>{key === 'nanHandling' ? 'NaN handling' : key}<select value={settings[key]} onChange={(event) => update(key, key === 'delay' ? Number(event.target.value) : key === 'decay' || key === 'truncation' ? Number(event.target.value) : event.target.value as never)}>
        {key === 'delay' ? [0, 1, 2].map((value) => <option key={value} value={value}>{value}</option>) : key === 'decay' ? [0, 1, 2, 4, 8].map((value) => <option key={value} value={value}>{value}</option>) : key === 'truncation' ? [0.01, 0.05, 0.08, 0.1, 0.2].map((value) => <option key={value} value={value}>{value}</option>) : settingOptions[key as keyof typeof settingOptions]?.map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label>)}
    </div>}
    <ResultsPanel onShowHistory={onShowHistory} />
  </section>;
}

function ResultsPanel({ onShowHistory }: { onShowHistory: () => void }) {
  const activeResultTab = useWorkspace((state) => state.activeResultTab);
  const setResultTab = useWorkspace((state) => state.setResultTab);
  const activeRunId = useWorkspace((state) => state.activeRunId);
  const { data: run, isLoading } = useQuery({ queryKey: ['simulation', activeRunId], queryFn: () => simulationApi.get(activeRunId!), enabled: Boolean(activeRunId), refetchInterval: (query) => ['queued', 'running'].includes(query.state.data?.status ?? '') ? 5000 : false });
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (run?.status !== 'running' || !run.timing?.startedAt) { setElapsed(0); return; }
    const start = new Date(run.timing.startedAt).getTime();
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [run?.status, run?.timing?.startedAt]);
  const tabs = ['Summary', 'PnL', 'Yearly', 'Checks', 'Log'] as const;
  const statusText = run ? run.status === 'completed' ? 'Complete' : run.status[0].toUpperCase() + run.status.slice(1) : 'No run yet';
  return <div className="results-panel">
    <div className="results-header"><div className="results-tabs" role="tablist" aria-label="Simulation results">{tabs.map((tab, index) => <button key={tab} id={`result-tab-${tab.toLowerCase()}`} role="tab" aria-selected={activeResultTab === tab} aria-controls="simulation-result-panel" tabIndex={activeResultTab === tab ? 0 : -1} onClick={() => setResultTab(tab)} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setResultTab(tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]); } }} className={activeResultTab === tab ? 'active' : ''}>{tab}{tab === 'Checks' && (run?.result?.checks?.length ? <i>{run.result.checks.length}</i> : null)}</button>)}</div><button className="run-status" onClick={onShowHistory}>{run && <span className={`status-dot ${run.status === 'completed' ? 'positive' : run.status === 'failed' ? 'negative' : 'amber'}`} />}<span>{run ? `Run #${run.runNumber} · ${statusText}` : statusText}</span>{run?.status === 'running' && <small><Clock3 size={11} /> {formatDuration(elapsed)}</small>}<span className="more">···</span></button></div>
    <div className="results-body" id="simulation-result-panel" role="tabpanel" aria-labelledby={`result-tab-${activeResultTab.toLowerCase()}`} tabIndex={0}>
      {isLoading ? <div className="state-row"><LoaderCircle size={15} className="spin" /> Loading result…</div> : !run ? <div className="results-empty"><span className="empty-chart">⌁</span><strong>No simulation results yet</strong><span>Run this expression to see its metrics and PnL.</span></div> : run.status === 'queued' || run.status === 'running' ? <div className="results-empty"><LoaderCircle size={18} className="spin amber-text" /><strong>Simulation {run.status}</strong><span>The worker will update this panel as the provider returns progress.</span></div> : run.status === 'failed' ? <div className="failure-box"><strong>Simulation failed</strong><span>{run.error?.message ?? run.error?.code ?? 'The provider could not complete this run.'}</span><small>{run.error?.code}</small></div> : run.status === 'cancelled' ? <div className="results-empty"><strong>Run cancelled</strong><span>This run was cancelled before the provider returned results.</span></div> : renderResultTab(activeResultTab, run)}
    </div>
  </div>;
}

function renderResultTab(tab: string, run: Simulation) {
  if (tab === 'Summary') return <><MetricCards metrics={run.result ?? {}} delta={run.deltaVsPrevious ?? {}} runNumber={run.runNumber} /><Suspense fallback={<div className="chart-empty">Loading PnL chart…</div>}><PnlChart points={run.result?.pnl ?? []} total={run.result?.pnlTotal} totalPct={run.result?.pnlTotalPct} runNumber={run.runNumber} source={run.result?.source} /></Suspense></>;
  if (tab === 'PnL') return <Suspense fallback={<div className="chart-empty">Loading PnL chart…</div>}><PnlChart points={run.result?.pnl ?? []} total={run.result?.pnlTotal} totalPct={run.result?.pnlTotalPct} runNumber={run.runNumber} source={run.result?.source} /></Suspense>;
  if (tab === 'Yearly') return <SimpleTable rows={run.result?.yearly ?? []} empty="No yearly breakdown was returned for this run." />;
  if (tab === 'Checks') return <ChecksList checks={run.result?.checks ?? []} />;
  return <div className="run-log"><div><span className="log-dot" /> Run queued <time>{formatDate(run.timing?.queuedAt)}</time></div>{run.timing?.startedAt && <div><span className="log-dot positive" /> Worker started <time>{formatDate(run.timing.startedAt)}</time></div>}{run.timing?.finishedAt && <div><span className={`log-dot ${run.status === 'completed' ? 'positive' : 'negative'}`} /> Run {run.status} <time>{formatDate(run.timing.finishedAt)}</time></div>}{run.error && <pre>{run.error.code}: {run.error.message}</pre>}<p>Metrics and run status are supplied by the connected provider.</p></div>;
}

function MetricCards({ metrics, delta, runNumber }: { metrics: Partial<Metrics>; delta: Partial<Metrics>; runNumber: number }) {
  const cards: { key: keyof Metrics; label: string; format: (value: number) => string; better: 'up' | 'down' }[] = [
    { key: 'sharpe', label: 'SHARPE', format: (value) => value.toFixed(2), better: 'up' },
    { key: 'fitness', label: 'FITNESS', format: (value) => value.toFixed(2), better: 'up' },
    { key: 'turnover', label: 'TURNOVER', format: (value) => `${(value * 100).toFixed(1)}%`, better: 'down' },
    { key: 'returns', label: 'RETURNS', format: (value) => `${(value * 100).toFixed(1)}%`, better: 'up' },
    { key: 'drawdown', label: 'DRAWDOWN', format: (value) => `${(value * 100).toFixed(1)}%`, better: 'down' },
    { key: 'margin', label: 'MARGIN', format: (value) => `${(value * 1000).toFixed(1)}‰`, better: 'up' },
  ];
  return <div className="metric-grid">{cards.map(({ key, label, format, better }) => {
    const value = metrics[key]; const change = delta[key];
    const good = typeof change === 'number' && (better === 'up' ? change >= 0 : change <= 0);
    return <div className="metric-card" key={key}><label>{label}</label><strong>{typeof value === 'number' ? format(value) : '—'}</strong>{typeof change === 'number' ? <small className={good ? 'positive-text' : 'negative-text'}>{change >= 0 ? '+' : ''}{key === 'turnover' || key === 'returns' || key === 'drawdown' ? `${(change * 100).toFixed(1)}%` : change.toFixed(2)} vs previous</small> : <small className="metric-subtle">{typeof value === 'number' ? `Run #${runNumber}` : 'Not returned'}</small>}</div>;
  })}</div>;
}

function SimpleTable({ rows, empty }: { rows: Record<string, unknown>[]; empty: string }) {
  if (!rows.length) return <div className="tab-empty">{empty}</div>;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table></div>;
}
function ChecksList({ checks }: { checks?: RunCheck[] }) {
  if (!checks?.length) return <div className="tab-empty">No provider checks were returned for this run.</div>;
  return <div className="checks-list">{checks.map((check, index) => <div className="check-row" key={index}><span className={`check-icon ${check.passed === false ? 'negative' : 'positive'}`}>{check.passed === false ? '×' : '✓'}</span><span className="check-name">{check.name ?? `Check ${index + 1}`}</span><span className="check-value">{check.value ?? check.result ?? '—'}</span><small>{check.limit !== undefined ? `Limit ${check.limit}` : check.passed === false ? 'Failed' : 'Passed'}</small></div>)}</div>;
}
function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function formatDate(value?: string) { return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'; }
