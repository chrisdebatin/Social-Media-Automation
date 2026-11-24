/**
 * Instagram API with Instagram Login (graph.instagram.com).
 * Flow: JPEG on public URL → item containers (is_carousel_item) → wait FINISHED → CAROUSEL container
 *       → wait FINISHED → media_publish → permalink.
 */

const version = () => process.env.IG_API_VERSION || 'v24.0';
const userId = () => process.env.IG_USER_ID || '';
const token = () => process.env.IG_ACCESS_TOKEN || '';

/**
 * Two token types exist:
 *  - Instagram Login tokens ("IG…")            → graph.instagram.com, expire after 60 days
 *  - Unified Login / system-user tokens ("EAA…") → graph.facebook.com, never expire
 * IG_API_HOST overrides the auto-detection.
 */
export function apiHost(): string {
  const override = process.env.IG_API_HOST?.trim();
  if (override) return override.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return token().startsWith('IG') ? 'graph.instagram.com' : 'graph.facebook.com';
}
export const tokenExpires = () => apiHost() === 'graph.instagram.com';
const base = () => `https://${apiHost()}/${version()}`;

export const instagramEnabled = () => !!userId() && !!token();

export class InstagramError extends Error {
  constructor(message: string, public code?: number, public subcode?: number) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | undefined>;

async function call<T>(method: 'GET' | 'POST', pathname: string, params: Params = {}): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, access_token: token() })) if (v !== undefined) body.set(k, String(v));
  const url = `${base()}/${pathname}`;
  const res = await fetch(method === 'GET' ? `${url}?${body}` : url, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: method === 'POST' ? body : undefined,
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } } & T;
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new InstagramError(`Instagram: ${e.error_user_msg || e.message || res.statusText}`, e.code, e.error_subcode);
  }
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFinished(containerId: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  let delay = 1500;
  while (Date.now() - start < timeoutMs) {
    const s = await call<{ status_code?: string; status?: string }>('GET', containerId, { fields: 'status_code,status' });
    if (s.status_code === 'FINISHED' || s.status_code === 'PUBLISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
      throw new InstagramError(`Instagram konnte das Medium nicht verarbeiten (${s.status ?? s.status_code}).`);
    }
    await sleep(delay);
    delay = Math.min(delay * 1.5, 5000);
  }
  throw new InstagramError('Zeitüberschreitung: Instagram verarbeitet das Medium noch. Bitte später erneut versuchen.');
}

export interface Quota {
  used: number;
  total: number;
  remaining: number;
}

export async function publishingQuota(): Promise<Quota> {
  const r = await call<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
    'GET', `${userId()}/content_publishing_limit`, { fields: 'config,quota_usage' },
  );
  const d = r.data?.[0] ?? {};
  const total = d.config?.quota_total ?? 100;
  const used = d.quota_usage ?? 0;
  return { used, total, remaining: Math.max(0, total - used) };
}

/**
 * The AI label flag. If the API version rejects the parameter we retry without it and
 * report a warning so the label can be set manually in the Instagram app.
 */
async function createWithAiFallback(params: Params, ai: boolean, warnings: string[]): Promise<string> {
  if (!ai) return (await call<{ id: string }>('POST', `${userId()}/media`, params)).id;
  try {
    return (await call<{ id: string }>('POST', `${userId()}/media`, { ...params, is_ai_generated: true })).id;
  } catch (e) {
    if (e instanceof InstagramError && e.code === 100 && /is_ai_generated|param/i.test(e.message)) {
      if (!warnings.length) warnings.push('Instagram hat das KI-Label über die API nicht akzeptiert – bitte im Beitrag in der App "KI-Info" aktivieren.');
      return (await call<{ id: string }>('POST', `${userId()}/media`, params)).id;
    }
    throw e;
  }
}

export interface PublishResult {
  mediaId: string;
  permalink: string | null;
  warnings: string[];
}

export async function publish(images: { url: string; ai: boolean }[], caption: string): Promise<PublishResult> {
  if (!instagramEnabled()) throw new InstagramError('Instagram ist nicht konfiguriert (IG_USER_ID, IG_ACCESS_TOKEN).');
  if (images.length < 1 || images.length > 10) throw new InstagramError('Instagram erlaubt 1–10 Bilder pro Beitrag.');
  if (images.some((i) => !i.url.startsWith('https://'))) throw new InstagramError('Bilder brauchen öffentliche https-URLs (Vercel Blob).');

  const quota = await publishingQuota();
  if (quota.remaining < 1) throw new InstagramError(`Tageslimit erreicht (${quota.used}/${quota.total} Beiträge in 24 h).`);

  const warnings: string[] = [];
  const anyAi = images.some((i) => i.ai);
  let containerId: string;

  if (images.length === 1) {
    containerId = await createWithAiFallback({ image_url: images[0].url, caption }, anyAi, warnings);
    await waitFinished(containerId);
  } else {
    const children: string[] = [];
    for (const img of images) {
      children.push(await createWithAiFallback({ image_url: img.url, is_carousel_item: true }, img.ai, warnings));
    }
    await Promise.all(children.map((id) => waitFinished(id)));
    containerId = await createWithAiFallback({ media_type: 'CAROUSEL', children: children.join(','), caption }, anyAi, warnings);
    await waitFinished(containerId);
  }

  const { id: mediaId } = await call<{ id: string }>('POST', `${userId()}/media_publish`, { creation_id: containerId });
  let permalink: string | null = null;
  try {
    permalink = (await call<{ permalink?: string }>('GET', mediaId, { fields: 'permalink' })).permalink ?? null;
  } catch {
    /* published anyway */
  }
  return { mediaId, permalink, warnings };
}

/** Long-lived tokens last 60 days; refresh at least 24 h after issue and before expiry. */
export async function refreshToken(): Promise<{ accessToken: string; expiresInDays: number }> {
  if (!token()) throw new InstagramError('IG_ACCESS_TOKEN fehlt.');
  if (!tokenExpires()) throw new InstagramError('Dieser Token (System-User / Unified Login) läuft nicht ab – kein Refresh nötig.');
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token())}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!res.ok || !json.access_token) throw new InstagramError(`Token-Refresh fehlgeschlagen: ${json.error?.message ?? res.statusText}`);
  return { accessToken: json.access_token, expiresInDays: Math.round((json.expires_in ?? 0) / 86400) };
}
