import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publish, publishingQuota, refreshToken } from '../lib/instagram';

type Call = { method: string; url: string; body: URLSearchParams };
let calls: Call[] = [];
let rejectAiParam = false;

function mockGraph() {
  let n = 0;
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = new URLSearchParams(method === 'POST' ? String(init?.body) : url.split('?')[1]);
    calls.push({ method, url, body });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (url.includes('content_publishing_limit')) return json({ data: [{ quota_usage: 3, config: { quota_total: 100 } }] });
    if (url.includes('refresh_access_token')) return json({ access_token: 'NEW', expires_in: 5184000 });
    if (url.endsWith('/media') && method === 'POST') {
      if (rejectAiParam && body.has('is_ai_generated')) return json({ error: { message: 'Invalid parameter is_ai_generated', code: 100 } }, 400);
      return json({ id: `c${++n}` });
    }
    if (url.includes('media_publish')) return json({ id: 'm1' });
    if (url.includes('fields=status_code')) return json({ status_code: 'FINISHED' });
    if (url.includes('fields=permalink')) return json({ permalink: 'https://www.instagram.com/p/abc/' });
    return json({ error: { message: 'unexpected ' + url } }, 500);
  });
}

beforeEach(() => {
  calls = [];
  rejectAiParam = false;
  vi.stubEnv('IG_USER_ID', '123');
  vi.stubEnv('IG_ACCESS_TOKEN', 'TOKEN');
  vi.stubEnv('IG_API_VERSION', 'v24.0');
  vi.stubGlobal('fetch', mockGraph());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const imgs = (n: number, ai = false) => Array.from({ length: n }, (_, i) => ({ url: `https://x.public.blob.vercel-storage.com/s${i}.jpg`, ai }));

describe('Instagram publishing', () => {
  it('publishes a carousel: items → CAROUSEL container → media_publish → permalink', async () => {
    const r = await publish(imgs(3), 'Hallo #Pflegeunion');
    expect(r).toMatchObject({ mediaId: 'm1', permalink: 'https://www.instagram.com/p/abc/', warnings: [] });
    const creates = calls.filter((c) => c.url.endsWith('/123/media'));
    expect(creates).toHaveLength(4);
    expect(creates.slice(0, 3).every((c) => c.body.get('is_carousel_item') === 'true')).toBe(true);
    expect(creates[3].body.get('media_type')).toBe('CAROUSEL');
    expect(creates[3].body.get('children')).toBe('c1,c2,c3');
    expect(creates[3].body.get('caption')).toBe('Hallo #Pflegeunion');
    expect(calls.every((c) => c.url.startsWith('https://graph.instagram.com/'))).toBe(true);
    expect(calls.find((c) => c.url.includes('media_publish'))!.body.get('creation_id')).toBe('c4');
  });

  it('publishes a single image without carousel flags', async () => {
    await publish(imgs(1), 'Einzelbild');
    const creates = calls.filter((c) => c.url.endsWith('/123/media'));
    expect(creates).toHaveLength(1);
    expect(creates[0].body.get('is_carousel_item')).toBeNull();
  });

  it('sets the AI label and falls back with a warning if the API rejects it', async () => {
    await publish(imgs(2, true), 'KI');
    expect(calls.filter((c) => c.body.get('is_ai_generated') === 'true').length).toBeGreaterThan(0);
    calls = [];
    rejectAiParam = true;
    const r = await publish(imgs(2, true), 'KI');
    expect(r.warnings[0]).toContain('KI-Info');
  });

  it('checks the quota and refuses non-https images', async () => {
    expect(await publishingQuota()).toEqual({ used: 3, total: 100, remaining: 97 });
    await expect(publish([{ url: 'data:image/jpeg;base64,AA', ai: false }], 'x')).rejects.toThrow('https');
    await expect(publish(imgs(11), 'x')).rejects.toThrow('1–10');
  });

  it('refreshes the token', async () => {
    expect(await refreshToken()).toEqual({ accessToken: 'NEW', expiresInDays: 60 });
  });
});
