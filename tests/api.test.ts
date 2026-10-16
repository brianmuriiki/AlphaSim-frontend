import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, setAccessToken, streamChat } from '../src/api';

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

describe('frontend API client', () => {
  it('silently refreshes a 401 and retries the original request once', async () => {
    setAccessToken('expired-access');
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return Response.json({ data: { accessToken: 'fresh-access' } });
      if (new Headers(init?.headers).get('Authorization') === 'Bearer expired-access') return Response.json({ error: { code: 'INVALID_TOKEN' } }, { status: 401 });
      return Response.json({ data: { id: 'user-1' } });
    });
    vi.stubGlobal('fetch', fetch);

    await expect(api<{ data: { id: string } }>('/users/me')).resolves.toEqual({ data: { id: 'user-1' } });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(new Headers((fetch.mock.calls[2] as unknown as [RequestInfo | URL, RequestInit])[1].headers).get('Authorization')).toBe('Bearer fresh-access');
  });

  it('parses streamed chat frames split across network chunks', async () => {
    setAccessToken('test-access');
    const chunks = ['data: {"t":"hel', 'lo"}\n\ndata: {"t":" world"}\n\ndata: {"done":true}\n\n'];
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })));
    const text: string[] = [];

    await streamChat({ message: 'explain this', history: [] }, (value) => text.push(value), new AbortController().signal);
    expect(text.join('')).toBe('hello world');
  });
});
