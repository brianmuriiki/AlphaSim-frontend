import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DiffEditor } from '@monaco-editor/react';
import { AlertTriangle, ArrowRight, Check, FileCode2, History, LoaderCircle, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { aiApi, ApiError, streamChat } from '../../api';
import { useLayout, useWorkspace } from '../../store';
import type { AiSuggestion, Simulation } from '../../types';

type Message = { role: 'user' | 'assistant'; content: string; createdAt?: string };
type Props = { alphaId: string; alphaName: string; run?: Simulation; onClose: () => void; showToast: (message: string) => void };
export function ForgeAIPanel({ alphaId, alphaName, run, onClose, showToast }: Props) {
  const queryClient = useQueryClient();
  const tab = useLayout((state) => state.aiTab); const setTab = useLayout((state) => state.setAiTab);
  const expression = useWorkspace((state) => state.expression); const settings = useWorkspace((state) => state.settings); const setExpression = useWorkspace((state) => state.setExpression); const setSettings = useWorkspace((state) => state.setSettings); const setActiveRun = useWorkspace((state) => state.setActiveRun); const markAiSource = useWorkspace((state) => state.markAiSource);
  const [messages, setMessages] = useState<Message[]>([]); const [message, setMessage] = useState(''); const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]); const [interactionId, setInteractionId] = useState<string>(); const [activeSuggestion, setActiveSuggestion] = useState<AiSuggestion>(); const [error, setError] = useState(''); const [conversationId, setConversationId] = useState<string>(); const [historyOpen, setHistoryOpen] = useState(false);
  const [includeRun, setIncludeRun] = useState(true); const [includeExpression, setIncludeExpression] = useState(true); const [contextOpen, setContextOpen] = useState(false); const [datafieldNames, setDatafieldNames] = useState<string[]>([]); const [attachments, setAttachments] = useState<{ name: string; content: string }[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const conversationsQuery = useQuery({ queryKey: ['ai-conversations', alphaId], queryFn: () => aiApi.conversations(alphaId), staleTime: 0 });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const contextRun = includeRun ? run : undefined;
  const chatMutation = useMutation({ mutationFn: async (text: string) => {
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller;
    const history = messages.filter((item) => item.content.trim()).slice(-10);
    const result: Message[] = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '' }]; setMessages(result);
    let answer = '';
    await streamChat({ message: text, alphaId, ...(contextRun ? { simulationId: contextRun.id ?? contextRun._id } : {}), expression, settings, includeExpression, datafieldNames, attachments, history }, (chunk) => { answer += chunk; setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, content: answer } : item)); }, controller.signal, (action) => {
      if (action.type === 'draft_updated' && action.alphaId === alphaId && typeof action.expression === 'string' && action.settings) {
        setExpression(action.expression); setSettings(action.settings); markAiSource();
        void queryClient.invalidateQueries({ queryKey: ['alpha', alphaId] });
        showToast('Forge AI updated the validated draft. Review it before running.');
      } else if (action.type === 'run_queued' && action.alphaId === alphaId && action.simulationId) {
        setActiveRun(action.simulationId);
        void Promise.all([queryClient.invalidateQueries({ queryKey: ['simulations', alphaId] }), queryClient.invalidateQueries({ queryKey: ['versions', alphaId] }), queryClient.invalidateQueries({ queryKey: ['alpha', alphaId] })]);
        showToast(`Run #${action.runNumber ?? ''} queued.`);
      } else if (action.type === 'version_saved' && action.alphaId === alphaId) {
        void Promise.all([queryClient.invalidateQueries({ queryKey: ['versions', alphaId] }), queryClient.invalidateQueries({ queryKey: ['alpha', alphaId] })]);
        showToast(`Version #${action.versionNumber ?? ''} saved.`);
      } else if (action.type === 'run_cancelled') {
        void queryClient.invalidateQueries({ queryKey: ['simulations', alphaId] });
        showToast('Run cancelled.');
      }
    });
    const completed = [...messages.filter((item) => item.content.trim()), { role: 'user' as const, content: text }, ...(answer.trim() ? [{ role: 'assistant' as const, content: answer.trim() }] : [])].slice(-60);
    const title = text.slice(0, 100) || alphaName;
    const cleanMessages = completed.map(({ role, content }) => ({ role, content })).filter((item) => item.content.trim());
    setMessages(completed);
    try {
      const saved = conversationId ? await aiApi.updateConversation(conversationId, { messages: cleanMessages, title }) : await aiApi.createConversation({ alphaId, title, messages: cleanMessages });
      setConversationId(saved.data._id); setMessages(saved.data.messages); await queryClient.invalidateQueries({ queryKey: ['ai-conversations', alphaId] });
    } catch {
      setError('Reply received, but chat history could not be saved. The conversation is still visible here.');
    }
  }, onError: (cause) => { setError(cause instanceof ApiError && cause.code === 'AI_NOT_CONFIGURED' ? 'Add an OpenRouter key in Settings to use Forge AI.' : cause instanceof ApiError && cause.code === 'AI_BUDGET_EXCEEDED' ? 'Monthly AI token budget reached.' : cause instanceof ApiError && (cause.code === 'RATE_LIMITED' || cause.code === 'AI_RATE_LIMITED') ? 'Forge AI is receiving too many requests. Try again shortly.' : cause instanceof ApiError ? cause.message : 'Forge AI could not complete this request. Try again.'); setMessages((current) => current.filter((item) => item.role !== 'assistant' || item.content)); }});
  const improveMutation = useMutation({ mutationFn: () => aiApi.improve(alphaId, contextRun?.id ?? contextRun?._id, expression, settings), onSuccess: (result) => { setSuggestions(result.suggestions); setInteractionId(result.interactionId); setError(result.suggestions.length ? '' : 'No validated suggestions were returned.'); }, onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Could not load suggestions.') });
  function send(event: FormEvent) { event.preventDefault(); const text = message.trim(); if (!text || chatMutation.isPending) return; setError(''); setMessage(''); chatMutation.mutate(text); }
  function startNewChat() { setConversationId(undefined); setMessages([]); setError(''); setSuggestions([]); setHistoryOpen(false); }
  function openConversation(item: NonNullable<typeof conversationsQuery.data>['items'][number]) { setConversationId(item._id); setMessages(item.messages); setError(''); setHistoryOpen(false); setTab('Chat'); }
  async function removeConversation(id: string) { await aiApi.deleteConversation(id); if (id === conversationId) startNewChat(); await queryClient.invalidateQueries({ queryKey: ['ai-conversations', alphaId] }); }
  function applySuggestion(suggestion: AiSuggestion) {
    setExpression(suggestion.expression); markAiSource();
    if (interactionId) void aiApi.outcome(interactionId, true).catch(() => undefined);
    showToast('Change inserted. Review it before running.'); setActiveSuggestion(undefined);
  }
  const history = useMemo(() => messages.slice(-12), [messages]);
  return <aside className="ai-panel">
    <div className="ai-heading"><div className="ai-icon"><Sparkles size={16} /></div><div><strong>Forge AI</strong><small>Context aware</small></div><button className="icon-button" title="New chat" aria-label="New chat" onClick={startNewChat}><Plus size={15} /></button><button className="icon-button ai-history" title="Conversation history" aria-label="Conversation history" onClick={() => setHistoryOpen((open) => !open)}><History size={15} /></button><button className="icon-button" onClick={onClose} aria-label="Close Forge AI"><X size={17} /></button></div>
    {historyOpen && <div className="conversation-history" aria-label="Saved conversations"><div className="conversation-history-title">Recent conversations</div>{conversationsQuery.data?.items.map((item) => <div className="conversation-row" key={item._id}><button onClick={() => openConversation(item)}>{item.title}</button><button className="icon-button" aria-label={`Delete ${item.title}`} onClick={() => void removeConversation(item._id)}><Trash2 size={13} /></button></div>)}{!conversationsQuery.data?.items.length && <p>No saved conversations yet.</p>}</div>}
    <div className="ai-tabs" role="tablist" aria-label="Forge AI tools"><button role="tab" aria-selected={tab === 'Chat'} tabIndex={tab === 'Chat' ? 0 : -1} className={tab === 'Chat' ? 'active' : ''} onClick={() => setTab('Chat')}>Chat</button><button role="tab" aria-selected={tab === 'Suggestions'} tabIndex={tab === 'Suggestions' ? 0 : -1} className={tab === 'Suggestions' ? 'active' : ''} onClick={() => setTab('Suggestions')}>Suggestions{suggestions.length > 0 && <i>{suggestions.length}</i>}</button></div>
    {tab === 'Chat' ? <>
      <div className="ai-content chat-content">
        <div className="context-chip"><FileCode2 size={13} /><span>{includeExpression ? 'Using expression.fe' : 'Expression context off'}{contextRun ? ` · Run #${contextRun.runNumber}` : ` · ${alphaName}`}</span>{contextRun && <button onClick={() => setIncludeRun(false)} aria-label="Remove run context"><X size={12} /></button>}</div>
        {!history.length && <div className="ai-welcome"><div className="ai-avatar"><Sparkles size={15} /></div><div><strong>Forge AI</strong><p>Ask about this alpha, its expression, or a completed run. Suggestions are checked before they appear.</p></div></div>}
        <div className="chat-messages">{history.map((item, index) => <div className={`chat-message ${item.role}`} key={index}><div className="chat-role">{item.role === 'assistant' ? 'FORGE AI' : 'YOU'}</div><p>{item.content || (chatMutation.isPending ? 'Thinking…' : '')}</p></div>)}{chatMutation.isPending && <div className="typing-state"><span /> <span /> <span /></div>}</div>
        {error && <div className="ai-inline-error"><AlertTriangle size={13} /> {error}</div>}
      </div>
      <form className="ai-composer" onSubmit={send}><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event as unknown as FormEvent); } }} placeholder="Ask about this alpha…" rows={2} aria-label="Message Forge AI" />{attachments.length > 0 && <div className="attachment-chips">{attachments.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((items) => items.filter((_, i) => i !== index))}><X size={11} /></button></span>)}</div>}<div><div className="context-picker-wrap"><button type="button" className="icon-button" title="Add context" aria-label="Add context" aria-expanded={contextOpen} onClick={() => setContextOpen((open) => !open)}><Plus size={16} /></button>{contextOpen && <div className="context-picker"><label><input type="checkbox" checked={includeExpression} onChange={(event) => setIncludeExpression(event.target.checked)} /> Include current expression</label><label><input type="checkbox" checked={includeRun} onChange={(event) => setIncludeRun(event.target.checked)} /> Include latest run</label><label>Datafields<input value={datafieldNames.join(', ')} onChange={(event) => setDatafieldNames(event.target.value.split(',').map((name) => name.trim()).filter(Boolean).slice(0, 20))} placeholder="comma-separated names" /></label><button type="button" onClick={() => fileInput.current?.click()}>Attach text or CSV file</button><small>Up to 3 files, 20 KB each. Text content is sent to Forge AI.</small></div>}</div><input ref={fileInput} hidden type="file" accept=".txt,.md,.csv,.fe,.json,text/plain,text/csv,application/json" multiple onChange={async (event) => { const chosen = Array.from(event.target.files ?? []).filter((file) => /\.(txt|md|csv|fe|json)$/i.test(file.name)).slice(0, 3 - attachments.length); const next = await Promise.all(chosen.map(async (file) => ({ name: file.name.slice(0, 120), content: await file.slice(0, 20000).text() }))); setAttachments((items) => [...items, ...next].slice(0, 3)); event.target.value = ''; }} /><button type="button" className="icon-button" title="Suggestions" onClick={() => setTab('Suggestions')}><Sparkles size={14} /></button><span>⌘ ↵</span><button type="submit" className="send-button" disabled={!message.trim() || chatMutation.isPending} aria-label="Send message"><Send size={14} /></button></div></form>
    </> : <>
      <div className="ai-content suggestions-content">
        <div className="context-chip"><FileCode2 size={13} /><span>Using expression.fe{contextRun ? ` + Run #${contextRun.runNumber}` : ''}</span>{contextRun && <button onClick={() => setIncludeRun(false)} aria-label="Remove run context"><X size={12} /></button>}</div>
        {suggestions.length ? <><div className="ai-intro"><div className="ai-avatar"><Sparkles size={14} /></div><div><strong>FORGE AI</strong><p>Ideas for this alpha. Review each change and run it yourself.</p></div></div>{suggestions.map((suggestion, index) => <article className="suggestion-card" key={suggestion.id ?? index}><div className="suggestion-title"><span className="suggestion-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{suggestion.title}</strong><small>{suggestion.category ?? 'Research'} · {suggestion.impact ?? 'Suggestion'}</small></div></div><p>{suggestion.rationale}</p><div className="suggestion-actions"><button className="btn btn-primary btn-sm" onClick={() => applySuggestion(suggestion)}><Plus size={14} /> Insert change</button><button className="btn btn-outline btn-sm" onClick={() => setActiveSuggestion(suggestion)}>View diff</button><button className="icon-button" onClick={() => setSuggestions((items) => items.filter((item) => item !== suggestion))} aria-label="Dismiss suggestion"><X size={15} /></button></div></article>)}</> : <div className="suggestions-empty"><div className="ai-avatar large"><Sparkles size={18} /></div><strong>Explore a new direction</strong><p>Forge AI can suggest a focused improvement based on the current expression and latest run.</p><button className="btn btn-primary" disabled={improveMutation.isPending} onClick={() => { setError(''); improveMutation.mutate(); }}>{improveMutation.isPending ? <><LoaderCircle size={14} className="spin" /> Thinking…</> : <>Get suggestions <ArrowRight size={14} /></>}</button>{error && <div className="ai-inline-error">{error}</div>}</div>}
        {error && suggestions.length > 0 && <div className="ai-inline-error">{error}</div>}
      </div>
    </>}
    <div className="ai-footnote">AI suggestions may be inaccurate. Metrics always come from BRAIN.</div>
    {activeSuggestion && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveSuggestion(undefined); }}><section className="diff-modal" role="dialog" aria-modal="true" aria-label="Preview suggestion"><header><div><strong>Preview change</strong><small>{activeSuggestion.title}</small></div><button className="icon-button" onClick={() => setActiveSuggestion(undefined)} aria-label="Close diff"><X size={17} /></button></header><DiffEditor height="min(58vh, 540px)" language="fast-expression" theme="alphasim-dark" original={expression} modified={activeSuggestion.expression} options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true }} /><footer><span>Applying this change only updates editor text; it will not run a simulation.</span><button className="btn btn-primary" onClick={() => applySuggestion(activeSuggestion)}><Check size={14} /> Insert change</button></footer></section></div>}
  </aside>;
}
