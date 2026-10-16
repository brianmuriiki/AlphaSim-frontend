import type { AiConversation, ApiErrorBody, Alpha, AlphaVersion, BrainStatus, Datafield, Experiment, Folder, LintResult, Operator, Settings, Simulation, User } from './types';

const API_ROOT = '/api/v1';
let accessToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAccessToken(token: string | null) { accessToken = token; }
export function getAccessToken() { return accessToken; }
export function onUnauthorized(callback: (() => void) | null) { unauthorizedHandler = callback; }

export class ApiError extends Error {
  constructor(public code: string, public status: number, message?: string, public details?: unknown) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => ({})) as { error?: ApiErrorBody };
  const proxyFailure = response.status === 502 && !body.error;
  const message = body.error?.message ?? (proxyFailure
    ? 'The development proxy could not reach the AlphaSim API on port 4000. Check that the backend is running.'
    : `The request failed with HTTP ${response.status}.`);
  return new ApiError(body.error?.code ?? (proxyFailure ? 'BACKEND_UNREACHABLE' : 'HTTP_ERROR'), response.status, message, body.error?.details);
}

async function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= fetch(`${API_ROOT}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) throw await toApiError(response);
      const body = await response.json() as { data?: { accessToken?: string } };
      const token = body.data?.accessToken;
      if (!token) throw new ApiError('INVALID_REFRESH_RESPONSE', 502);
      setAccessToken(token);
      return token;
    })
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    try {
      await refreshAccessToken();
      return api<T>(path, init, false);
    } catch {
      setAccessToken(null);
      unauthorizedHandler?.();
      throw new ApiError('UNAUTHENTICATED', 401, 'Your session has expired. Sign in again.');
    }
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const authApi = {
  refresh: refreshAccessToken,
  login: (body: { email: string; password: string }) => api<{ data: { user: User; accessToken: string } }>('/auth/login', json('POST', body), false),
  register: (body: { email: string; password: string; displayName: string }) => api<{ data: { user: User; accessToken: string } }>('/auth/register', json('POST', body), false),
  logout: () => api<void>('/auth/logout', json('POST'), false),
};

export const userApi = {
  me: () => api<{ data: User }>('/users/me'),
  update: (body: Partial<Pick<User, 'displayName' | 'preferences'>>) => api<{ data: User }>('/users/me', json('PATCH', body)),
  aiKeyStatus: () => api<{ configured: boolean; source: 'account' | 'server' | 'none' }>('/users/me/ai-key'),
  setAiKey: (apiKey: string) => api<{ configured: boolean; source: string }>('/users/me/ai-key', json('PUT', { apiKey })),
  removeAiKey: () => api<void>('/users/me/ai-key', json('DELETE')),
};
export const brainApi = {
  status: () => api<BrainStatus>('/brain/status'),
  connect: (body: { email: string; password: string }) => api<{ status: string; mode?: string; url?: string }>('/brain/connect', json('POST', body)),
  disconnect: () => api<{ status: string }>('/brain/disconnect', json('DELETE')),
};
export const alphaApi = {
  list: (params: URLSearchParams = new URLSearchParams()) => api<{ data?: Alpha[]; items?: Alpha[]; nextCursor?: string; meta?: { total?: number } }>(`/alphas?${params}`),
  get: (id: string) => api<{ data: Alpha }>(`/alphas/${id}`),
  create: (body: { name: string; description?: string; expression?: string; settings?: Settings; folderId?: string | null }) => api<{ data: Alpha }>('/alphas', json('POST', body)),
  update: (id: string, body: Record<string, unknown>) => api<{ data: Alpha }>(`/alphas/${id}`, json('PATCH', body)),
  saveDraft: (id: string, body: { expression: string; settings: Settings }) => api<{ data: Alpha }>(`/alphas/${id}/draft`, json('PUT', body)),
  versions: (id: string) => api<{ data: AlphaVersion[] }>(`/alphas/${id}/versions`),
  saveVersion: (id: string, body: { expression: string; settings: Settings; source: 'manual' | 'ai'; note?: string }) => api<{ data: AlphaVersion }>(`/alphas/${id}/versions`, json('POST', body)),
  restore: (id: string, number: number) => api<{ data: AlphaVersion }>(`/alphas/${id}/versions/${number}/restore`, json('POST')),
  delete: (id: string) => api<void>(`/alphas/${id}`, json('DELETE')),
};
export const folderApi = {
  list: () => api<{ data: Folder[] }>('/folders'),
  create: (name: string) => api<{ data: Folder }>('/folders', json('POST', { name })),
  remove: (id: string) => api<void>(`/folders/${id}`, json('DELETE')),
};
export const simulationApi = {
  list: (alphaId?: string) => api<{ items: Simulation[]; nextCursor?: string }>(`/simulations${alphaId ? `?alphaId=${encodeURIComponent(alphaId)}` : ''}`),
  get: (id: string) => api<Simulation>(`/simulations/${id}`),
  run: (body: { alphaId: string; expression: string; settings: Settings; source?: 'manual' | 'ai' }) => api<{ id: string; runNumber: number; status: Simulation['status'] }>('/simulations', json('POST', body)),
  cancel: (id: string) => api<{ id: string; status: string }>(`/simulations/${id}`, json('DELETE')),
  retry: (id: string) => api<{ id: string; runNumber: number; status: Simulation['status'] }>(`/simulations/${id}/retry`, json('POST')),
  compare: (ids: string[]) => api<{ data: Simulation[] }>(`/simulations/compare?ids=${ids.map(encodeURIComponent).join(',')}`),
  rawUrl: (id: string) => `${API_ROOT}/simulations/${id}/raw`,
};
export const lintApi = { check: (expression: string, settings: Settings) => api<LintResult>('/lint', json('POST', { expression, settings })) };
export const catalogApi = {
  datafields: (params: URLSearchParams) => api<{ items: Datafield[]; total: number; nextCursor: string | null }>(`/datafields?${params}`),
  operators: () => api<{ items: Operator[]; count: number }>('/operators'),
};
export const aiApi = {
  conversations: (alphaId: string) => api<{ items: AiConversation[] }>(`/ai/conversations?alphaId=${encodeURIComponent(alphaId)}`),
  createConversation: (body: { alphaId: string; title: string; messages: AiConversation['messages'] }) => api<{ data: AiConversation }>('/ai/conversations', json('POST', body)),
  updateConversation: (id: string, body: { title?: string; messages?: AiConversation['messages'] }) => api<{ data: AiConversation }>(`/ai/conversations/${id}`, json('PATCH', body)),
  deleteConversation: (id: string) => api<void>(`/ai/conversations/${id}`, json('DELETE')),
  improve: (alphaId: string, simulationId?: string, expression?: string, settings?: import('./types').Settings) => api<{ suggestions: import('./types').AiSuggestion[]; interactionId: string }>('/ai/improve', json('POST', { alphaId, ...(simulationId ? { simulationId } : {}), ...(expression !== undefined ? { expression } : {}), ...(settings ? { settings } : {}) })),
  explain: (body: Record<string, unknown>) => api<{ explanation: string; interactionId: string }>('/ai/explain', json('POST', body)),
  fix: (body: Record<string, unknown>) => api<{ expression: string; rationale: string; interactionId: string }>('/ai/fix', json('POST', body)),
  generate: (body: Record<string, unknown>) => api<{ suggestions: import('./types').AiSuggestion[]; interactionId: string }>('/ai/generate', json('POST', body)),
  outcome: (id: string, accepted: boolean) => api(`/ai/interactions/${id}/outcome`, json('PATCH', { accepted })),
};
export const experimentApi = {
  create: (body: { name: string; baseVersionId: string; parameterGrid: { path: string; values: Array<string | number> }[] }) => api<{ data: Experiment }>('/experiments', json('POST', body)),
  get: (id: string) => api<{ data: Experiment }>(`/experiments/${id}`),
};

export async function streamChat(body: { message: string; alphaId?: string; simulationId?: string; expression?: string; settings?: import('./types').Settings; includeExpression?: boolean; history: { role: 'user' | 'assistant'; content: string }[]; attachments?: { name: string; content: string }[]; datafieldNames?: string[] }, onText: (text: string) => void, signal: AbortSignal, onAction?: (action: { type: string; alphaId?: string; expression?: string; settings?: import('./types').Settings; simulationId?: string; runNumber?: number; versionNumber?: number }) => void) {
  const send = async (retry: boolean): Promise<Response> => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(`${API_ROOT}/ai/chat`, { method: 'POST', headers, credentials: 'include', body: JSON.stringify(body), signal });
    if (response.status === 401 && retry) {
      try { await refreshAccessToken(); }
      catch {
        setAccessToken(null);
        unauthorizedHandler?.();
        throw new ApiError('UNAUTHENTICATED', 401, 'Your session has expired. Sign in again.');
      }
      return send(false);
    }
    return response;
  };
  const response = await send(true);
  if (!response.ok || !response.body) throw await toApiError(response);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
      if (!data) continue;
      const event = JSON.parse(data) as { t?: string; done?: boolean; error?: ApiErrorBody; action?: { type: string; alphaId?: string; expression?: string; settings?: import('./types').Settings; simulationId?: string; runNumber?: number; versionNumber?: number } };
      if (event.t) onText(event.t);
      if (event.action) onAction?.(event.action);
      if (event.error) throw new ApiError(event.error.code, 500, event.error.message);
      if (event.done) return;
    }
  }
}
