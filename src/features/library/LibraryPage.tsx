import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileCode2, LoaderCircle, Plus, Search, Trash2 } from 'lucide-react';
import { alphaApi, ApiError } from '../../api';
import type { Alpha } from '../../types';

export function LibraryPage() {
  const [search, setSearch] = useState(''); const [notice, setNotice] = useState(''); const client = useQueryClient();
  const query = useQuery({ queryKey: ['alphas', { q: search }], queryFn: () => alphaApi.list(search ? new URLSearchParams({ q: search }) : new URLSearchParams()) });
  const items = query.data?.data ?? query.data?.items ?? [];
  const create = useMutation({ mutationFn: () => alphaApi.create({ name: 'Untitled Alpha', expression: '' }), onSuccess: async (result) => { await client.invalidateQueries({ queryKey: ['alphas'] }); window.location.assign(`/workspace/${result.data._id}`); } });
  const remove = useMutation({ mutationFn: alphaApi.delete, onSuccess: () => { setNotice('Alpha moved to the archive.'); void client.invalidateQueries({ queryKey: ['alphas'] }); }, onError: (error) => setNotice(error instanceof ApiError ? error.message : 'Could not delete alpha.') });
  return <main className="content-page">
    <div className="page-heading"><div><span className="eyebrow">RESEARCH</span><h1>Alpha library</h1><p>Organize your expressions, versions, and best runs.</p></div><button className="btn btn-primary" onClick={() => create.mutate()} disabled={create.isPending}><Plus size={15} /> New alpha</button></div>
    <label className="page-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search names, descriptions, and tags" /></label>
    {notice && <div className="notice-row" role="status">{notice}</div>}
    {query.isLoading ? <div className="page-state"><LoaderCircle size={17} className="spin" /> Loading alphas…</div> : query.isError ? <div className="page-state error-state">Could not load the library. <button onClick={() => void query.refetch()}>Retry</button></div> : items.length ? <div className="alpha-library-grid">{items.map((alpha) => <AlphaCard key={alpha._id} alpha={alpha} onDelete={() => { if (window.confirm(`Move “${alpha.name}” to the archive?`)) remove.mutate(alpha._id); }} />)}</div> : <div className="page-empty"><FileCode2 size={25} /><strong>{search ? 'No matching alphas' : 'Your library is empty'}</strong><span>{search ? 'Try a different search.' : 'Create an alpha to start working in the IDE.'}</span>{!search && <button className="btn btn-primary" onClick={() => create.mutate()}><Plus size={14} /> Create alpha</button>}</div>}
  </main>;
}

function AlphaCard({ alpha, onDelete }: { alpha: Alpha; onDelete: () => void }) {
  return <article className="alpha-card"><div className="alpha-card-top"><div className="alpha-card-icon"><FileCode2 size={16} /></div><span className={`status-pill ${alpha.status}`}>{alpha.status}</span><button className="icon-button destructive-hover" onClick={onDelete} title="Archive alpha"><Trash2 size={15} /></button></div><h2>{alpha.name}</h2><p>{alpha.description || 'No description added.'}</p><div className="alpha-card-code">{alpha.draft?.expression ?? alpha.currentVersion?.expression ?? 'Empty expression'}</div><div className="alpha-card-metrics">{(['sharpe', 'fitness', 'turnover'] as const).map((metric) => <div key={metric}><small>{metric}</small><strong>{alpha.bestMetrics?.[metric] === undefined ? '—' : metric === 'turnover' ? `${(alpha.bestMetrics[metric]! * 100).toFixed(1)}%` : alpha.bestMetrics[metric]!.toFixed(2)}</strong></div>)}</div><footer><span>{alpha.runCounter ?? 0} runs · v{alpha.versionCounter ?? 1}</span><Link to={`/workspace/${alpha._id}`}>Open workspace <ArrowUpRight size={13} /></Link></footer></article>;
}
