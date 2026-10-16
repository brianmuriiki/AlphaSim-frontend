import ReactECharts from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { PnlPoint } from '../../types';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

function pointValue(point: PnlPoint): { label: string; value: number } | null {
  if (Array.isArray(point)) return typeof point[1] === 'number' ? { label: String(point[0]), value: point[1] } : null;
  const value = point.value ?? point.pnl;
  return typeof value === 'number' ? { label: point.date ?? point.timestamp ?? '', value } : null;
}

export function PnlChart({ points, total, totalPct, runNumber, source }: { points: PnlPoint[]; total?: number; totalPct?: number; runNumber?: number; source?: 'brain' | 'mock' }) {
  const values = points.map(pointValue).filter((item): item is { label: string; value: number } => item !== null);
  const option = {
    animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    grid: { left: 0, right: 0, top: 8, bottom: 4, containLabel: false },
    tooltip: { trigger: 'axis', backgroundColor: '#191a1b', borderColor: '#343738', textStyle: { color: '#e7e8e8', fontSize: 11 } },
    xAxis: { type: 'category', data: values.map((point) => point.label), boundaryGap: false, show: false },
    yAxis: { type: 'value', scale: true, splitNumber: 3, axisLabel: { color: '#656b6a', fontSize: 9 }, splitLine: { lineStyle: { color: '#25292a' } } },
    series: [{ type: 'line', data: values.map((point) => point.value), smooth: 0.25, showSymbol: false, lineStyle: { color: '#41b7a5', width: 2 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(65,183,165,.28)' }, { offset: 1, color: 'rgba(65,183,165,.015)' }] } } }],
  };
  return <div className="chart-wrap">
    <div className="chart-heading"><div><strong>Cumulative PnL</strong><small>From {source === 'mock' ? 'local mock provider' : 'BRAIN'}{runNumber ? ` · Run #${runNumber}` : ''}</small></div><div className="chart-total">{typeof total === 'number' ? total.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—'}{typeof totalPct === 'number' && <small className={totalPct >= 0 ? 'positive-text' : 'negative-text'}>{totalPct >= 0 ? '+' : ''}{(totalPct * 100).toFixed(1)}%</small>}</div></div>
    {values.length ? <ReactECharts option={option} style={{ height: 150, width: '100%' }} notMerge lazyUpdate /> : <div className="chart-empty">PnL series will appear here when the provider returns one.</div>}
  </div>;
}
