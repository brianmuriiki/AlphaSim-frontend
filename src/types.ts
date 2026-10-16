export type Settings = {
  region: string;
  universe: string;
  delay: number;
  decay: number;
  neutralization: string;
  truncation: number;
  pasteurization: string;
  nanHandling: string;
  language: string;
};

export const defaultSettings: Settings = {
  region: 'USA', universe: 'TOP3000', delay: 1, decay: 0,
  neutralization: 'SUBINDUSTRY', truncation: 0.08, pasteurization: 'ON',
  nanHandling: 'OFF', language: 'FASTEXPR',
};

export type ApiErrorBody = { code: string; message: string; details?: unknown };
export type User = { id: string; email: string; displayName: string; preferences?: Record<string, unknown>; limits?: { maxActiveRuns: number } };
export type BrainStatus = { status: 'none' | 'connected' | 'expired' | 'verification_pending'; mode?: string | null; sessionExpiresAt?: string; url?: string };
export type Folder = { _id: string; name: string; parentId?: string | null; alphaCount?: number };
export type AlphaVersion = { _id: string; versionNumber: number; expression: string; settings: Settings; source?: string; note?: string; createdAt: string };
export type Alpha = {
  _id: string; name: string; description?: string; folderId?: string | null; tags?: string[];
  currentVersionId?: string; currentVersion?: AlphaVersion | null;
  draft?: { expression: string; settings: Settings };
  versionCounter: number; runCounter: number; status: string; bestMetrics?: Partial<Metrics>;
};
export type Metrics = { sharpe: number; fitness: number; turnover: number; returns: number; drawdown: number; margin: number };
export type PnlPoint = { date?: string; value?: number; pnl?: number; timestamp?: string } | [string | number, number];
export type YearRow = Record<string, string | number | boolean | null>;
export type RunCheck = { name?: string; result?: string; value?: number | string; limit?: number | string; passed?: boolean; [key: string]: unknown };
export type Simulation = {
  _id?: string; id?: string; alphaId: string; versionId?: string; runNumber: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: Partial<Metrics> & { yearly?: YearRow[]; checks?: RunCheck[]; pnl?: PnlPoint[]; pnlTotal?: number; pnlTotalPct?: number; source?: 'brain' | 'mock' };
  deltaVsPrevious?: Partial<Metrics>; error?: { code: string; message: string };
  timing?: { queuedAt?: string; startedAt?: string; finishedAt?: string };
};
export type Datafield = { _id: string; name: string; description?: string; type?: string; region?: string; universe?: string; delay?: number; datasetId?: string };
export type Operator = { name: string; category?: string; signature?: string; description?: string; examples?: string[] };
export type LintResult = { errors: LintIssue[]; warnings: LintIssue[] };
export type LintIssue = { code: string; message: string; line: number; col: number };
export type AiSuggestion = { id?: string; title: string; category?: string; impact?: string; rationale: string; expression: string };
export type AiConversation = { _id: string; alphaId: string; title: string; messages: { role: 'user' | 'assistant'; content: string; createdAt?: string }[]; updatedAt: string };
export type Experiment = { _id: string; id?: string; name: string; status: string; progress: { done: number; total: number; failed: number }; simulations?: Simulation[] };

export function idOf(value: { _id?: string; id?: string }): string {
  return value._id ?? value.id ?? '';
}
