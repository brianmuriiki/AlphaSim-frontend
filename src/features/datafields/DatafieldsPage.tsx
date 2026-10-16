import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Layers3, LoaderCircle, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { catalogApi } from '../../api';

export function DatafieldsPage() {
  const [params, setParams] = useSearchParams(); const [search, setSearch] = useState('');
  const tab = params.get('tab') === 'operators' ? 'operators' : 'datafields';
  const fieldParams = useMemo(() => new URLSearchParams({ q: search, limit: '100' }), [search]);
  const fields = useQuery({ queryKey: ['datafields', { q: search }], queryFn: () => catalogApi.datafields(fieldParams), enabled: tab === 'datafields', staleTime: 60_000 });
  const operators = useQuery({ queryKey: ['operators'], queryFn: catalogApi.operators, enabled: tab === 'operators', staleTime: 30 * 60_000 });
  return <main className="content-page">
    <div className="page-heading"><div><span className="eyebrow">REFERENCE</span><h1>Datafields & operators</h1><p>Browse fields and Fast Expression functions available to your workspace.</p></div></div>
    <div className="catalog-tabs"><button className={tab === 'datafields' ? 'active' : ''} onClick={() => setParams({})}><Database size={15} /> Datafields <small>{fields.data?.total?.toLocaleString() ?? '—'}</small></button><button className={tab === 'operators' ? 'active' : ''} onClick={() => setParams({ tab: 'operators' })}><Layers3 size={15} /> Operators <small>{operators.data?.count?.toLocaleString() ?? '—'}</small></button></div>
    {tab === 'datafields' ? <><label className="page-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search datafields" /></label>{fields.isLoading ? <div className="page-state"><LoaderCircle size={17} className="spin" /> Loading datafields…</div> : fields.isError ? <div className="page-state error-state">Could not load datafields. <button onClick={() => void fields.refetch()}>Retry</button></div> : fields.data?.items.length ? <div className="catalog-table"><table><thead><tr><th>Field</th><th>Description</th><th>Dataset</th><th>Region</th><th>Universe</th><th>Delay</th></tr></thead><tbody>{fields.data.items.map((field) => <tr key={field._id}><td><code>{field.name}</code></td><td>{field.description ?? '—'}</td><td>{field.datasetId ?? '—'}</td><td>{field.region ?? '—'}</td><td>{field.universe ?? '—'}</td><td>{field.delay ?? '—'}</td></tr>)}</tbody></table></div> : <div className="page-empty"><Database size={24} /><strong>No datafields found</strong><span>Connect a provider with a field catalog, or adjust your search.</span></div>}</> : <>{operators.isLoading ? <div className="page-state"><LoaderCircle size={17} className="spin" /> Loading operators…</div> : operators.isError ? <div className="page-state error-state">Could not load operators. <button onClick={() => void operators.refetch()}>Retry</button></div> : <div className="operator-grid">{operators.data?.items.map((operator) => <article className="operator-card" key={operator.name}><div><Layers3 size={14} /><span>{operator.category ?? 'Operator'}</span></div><h2>{operator.name}</h2><code>{operator.signature ?? `${operator.name}(…)`}</code><p>{operator.description ?? 'No description available.'}</p>{operator.examples?.length ? <pre>{operator.examples[0]}</pre> : null}</article>)}</div>}</>}
  </main>;
}
