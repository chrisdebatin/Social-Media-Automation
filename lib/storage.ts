/**
 * Storage: Vercel Blob (public URLs – required by the Instagram API).
 * Without BLOB_READ_WRITE_TOKEN: images become data URLs and drafts go to ./.data/drafts (local dev only).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { put, list, del } from '@vercel/blob';
import { draftSchema, submissionSchema, type Draft, type Submission } from './schema';

export const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;
/** Local file drafts work only where the filesystem persists (not on Vercel). */
const localDraftsEnabled = () => !blobEnabled() && !process.env.VERCEL;
export const draftsEnabled = () => blobEnabled() || localDraftsEnabled();
export type StorageMode = 'blob' | 'local' | 'none';
export const storageMode = (): StorageMode => (blobEnabled() ? 'blob' : localDraftsEnabled() ? 'local' : 'none');

/** Store a file. Returns a public https URL (Blob) or a data URL (fallback). */
export async function putFile(name: string, data: Buffer, contentType: string): Promise<string> {
  if (!blobEnabled()) return `data:${contentType};base64,${data.toString('base64')}`;
  const safe = name.replace(/[^a-zA-Z0-9._/-]/g, '-');
  const blob = await put(safe, data, { access: 'public', contentType, addRandomSuffix: true });
  return blob.url;
}

/* ----------------------------------------------------------------- drafts */

const DRAFT_DIR = path.join(process.cwd(), '.data', 'drafts');
const DRAFT_PREFIX = 'drafts/';
const validId = (id: string) => /^[a-z0-9]{6,32}$/.test(id);

export interface DraftMeta {
  id: string;
  title: string;
  updatedAt: string;
  slides: number;
}

export async function saveDraft(d: Draft): Promise<void> {
  if (!validId(d.id)) throw new Error('Ungültige Entwurfs-ID');
  const json = JSON.stringify(draftSchema.parse(d));
  if (blobEnabled()) {
    await put(`${DRAFT_PREFIX}${d.id}.json`, json, {
      access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
    });
    return;
  }
  if (!localDraftsEnabled()) throw new Error('Entwürfe brauchen Vercel Blob (BLOB_READ_WRITE_TOKEN).');
  await fs.mkdir(DRAFT_DIR, { recursive: true });
  await fs.writeFile(path.join(DRAFT_DIR, `${d.id}.json`), json);
}

export async function loadDraft(id: string): Promise<Draft | null> {
  if (!validId(id)) return null;
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: `${DRAFT_PREFIX}${id}.json` });
    const b = blobs[0];
    if (!b) return null;
    const res = await fetch(`${b.url}?v=${Date.parse(String(b.uploadedAt)) || Date.now()}`, { cache: 'no-store' });
    return res.ok ? draftSchema.parse(await res.json()) : null;
  }
  try {
    return draftSchema.parse(JSON.parse(await fs.readFile(path.join(DRAFT_DIR, `${id}.json`), 'utf8')));
  } catch {
    return null;
  }
}

export async function listDrafts(): Promise<DraftMeta[]> {
  let drafts: Draft[] = [];
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: DRAFT_PREFIX, limit: 100 });
    const loaded = await Promise.all(
      blobs.map((b) => loadDraft(b.pathname.slice(DRAFT_PREFIX.length).replace(/\.json$/, '')).catch(() => null)),
    );
    drafts = loaded.filter((d): d is Draft => !!d);
  } else if (localDraftsEnabled()) {
    let files: string[] = [];
    try {
      files = await fs.readdir(DRAFT_DIR);
    } catch {
      /* no drafts yet */
    }
    const loaded = await Promise.all(files.filter((f) => f.endsWith('.json')).map((f) => loadDraft(f.replace(/\.json$/, ''))));
    drafts = loaded.filter((d): d is Draft => !!d);
  }
  return drafts
    .map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt, slides: d.slides.length }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteDraft(id: string): Promise<void> {
  if (!validId(id)) return;
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: `${DRAFT_PREFIX}${id}.json` });
    if (blobs.length) await del(blobs.map((b) => b.url));
    return;
  }
  await fs.rm(path.join(DRAFT_DIR, `${id}.json`), { force: true });
}

/* ------------------------------------------------------------ submissions */

const SUB_DIR = path.join(process.cwd(), '.data', 'submissions');
const SUB_PREFIX = 'submissions/';

export async function saveSubmission(sub: Submission): Promise<void> {
  if (!validId(sub.id)) throw new Error('Ungültige ID');
  const json = JSON.stringify(submissionSchema.parse(sub));
  if (blobEnabled()) {
    await put(`${SUB_PREFIX}${sub.id}.json`, json, {
      access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
    });
    return;
  }
  if (!localDraftsEnabled()) throw new Error('Einreichungen brauchen Vercel Blob.');
  await fs.mkdir(SUB_DIR, { recursive: true });
  await fs.writeFile(path.join(SUB_DIR, `${sub.id}.json`), json);
}

export async function loadSubmission(id: string): Promise<Submission | null> {
  if (!validId(id)) return null;
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: `${SUB_PREFIX}${id}.json` });
    if (!blobs[0]) return null;
    const res = await fetch(`${blobs[0].url}?v=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? submissionSchema.parse(await res.json()) : null;
  }
  try {
    return submissionSchema.parse(JSON.parse(await fs.readFile(path.join(SUB_DIR, `${id}.json`), 'utf8')));
  } catch {
    return null;
  }
}

export async function listSubmissions(): Promise<Submission[]> {
  let ids: string[] = [];
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: SUB_PREFIX, limit: 200 });
    ids = blobs.map((b) => b.pathname.slice(SUB_PREFIX.length).replace(/\.json$/, ''));
  } else if (localDraftsEnabled()) {
    ids = (await fs.readdir(SUB_DIR).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  }
  const subs = await Promise.all(ids.map((id) => loadSubmission(id).catch(() => null)));
  return subs.filter((s): s is Submission => !!s).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Deletes the submission and its photos (data minimisation). */
export async function deleteSubmission(id: string): Promise<void> {
  const sub = await loadSubmission(id);
  if (!sub) return;
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: `${SUB_PREFIX}${id}.json` });
    const urls = [...blobs.map((b) => b.url), ...sub.photos.map((p) => p.src).filter((u) => u.startsWith('https://'))];
    if (urls.length) await del(urls);
    return;
  }
  await fs.rm(path.join(SUB_DIR, `${id}.json`), { force: true });
}
