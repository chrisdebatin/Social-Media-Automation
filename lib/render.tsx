import React from 'react';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { canvas, fonts, logo } from './brand';
import { readAsset, accentFontFile } from './assets';
import { layoutSlide, renderSlideElement, overflowingSlots, type RenderAssets, type LayoutCtx } from './templates';
import { templateCatalog, type Slide } from './schema';

/* ------------------------------------------------------------------ fonts */
type FontEntry = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: 'normal' };
let fontCache: FontEntry[] | null = null;

const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

function loadFonts(): FontEntry[] {
  if (!fontCache) {
    fontCache = [
      { name: fonts.sans, data: ab(readAsset('fonts/NunitoSans-Regular.woff')), weight: 400, style: 'normal' },
      { name: fonts.sans, data: ab(readAsset('fonts/NunitoSans-Bold.woff')), weight: 700, style: 'normal' },
      { name: fonts.sans, data: ab(readAsset('fonts/NunitoSans-ExtraBold.woff')), weight: 800, style: 'normal' },
      { name: fonts.accent, data: ab(readAsset(accentFontFile().file)), weight: 400, style: 'normal' },
    ];
  }
  return fontCache;
}

/* ----------------------------------------------------------------- images */
interface ResolvedImage { src: string; width: number; height: number }
const imageCache = new Map<string, ResolvedImage>();
const MAX_CACHE = 40;

const ALLOWED_REMOTE = [/\.public\.blob\.vercel-storage\.com$/, /(^|\.)pflegeunion\.de$/];

async function fetchRemote(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_REMOTE.some((r) => r.test(u.hostname))) {
    throw new Error(`Bildquelle nicht erlaubt: ${u.hostname}`);
  }
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Bild konnte nicht geladen werden (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Load any photo reference, downscale to max 1600 px and return a data URL Satori can draw. */
export async function resolveImage(src: string): Promise<ResolvedImage> {
  const hit = imageCache.get(src);
  if (hit) return hit;
  let buf: Buffer;
  if (src.startsWith('asset:')) buf = readAsset(src.slice('asset:'.length));
  else if (src.startsWith('data:')) buf = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
  else buf = await fetchRemote(src);

  const img = sharp(buf).rotate(); // respect EXIF orientation
  const meta = await img.metadata();
  const alpha = !!meta.hasAlpha;
  const out = await img
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .toFormat(alpha ? 'png' : 'jpeg', alpha ? {} : { quality: 90 })
    .toBuffer({ resolveWithObject: true });
  const resolved = {
    src: `data:image/${alpha ? 'png' : 'jpeg'};base64,${out.data.toString('base64')}`,
    width: out.info.width,
    height: out.info.height,
  };
  if (imageCache.size >= MAX_CACHE) imageCache.delete(imageCache.keys().next().value!);
  imageCache.set(src, resolved);
  return resolved;
}

let brandCache: Omit<RenderAssets, 'photo'> | null = null;
function brandAssets(): Omit<RenderAssets, 'photo'> {
  if (!brandCache) {
    const d = (f: string) => `data:image/png;base64,${readAsset(f).toString('base64')}`;
    brandCache = {
      logoHaupt: d(logo.files.hauptversion),
      logoAlt: d(logo.files.alternative),
      kreisHaupt: d(logo.files.kreisHaupt),
      kreisAlt: d(logo.files.kreisAlt),
    };
  }
  return brandCache;
}

/* ----------------------------------------------------------------- render */
export interface RenderResult {
  png: Buffer;
  overflow: string[];
}

export async function renderSlide(slide: Slide, pos: { index: number; total: number }): Promise<RenderResult> {
  const spec = templateCatalog[slide.template];
  const photo = spec.photo !== 'none' && slide.photo?.src ? await resolveImage(slide.photo.src) : null;
  const ctx: LayoutCtx = { ...pos, photoAspect: photo ? photo.width / photo.height : undefined };
  const L = layoutSlide(slide, ctx);
  const el = renderSlideElement(slide, L, { ...brandAssets(), photo }, ctx);
  const res = new ImageResponse(el as React.ReactElement, { width: canvas.width, height: canvas.height, fonts: loadFonts() });
  const png = Buffer.from(await res.arrayBuffer());
  return { png, overflow: overflowingSlots(L) };
}

/** Instagram only accepts JPEG. sRGB, 4:5, high quality. */
export async function toJpeg(png: Buffer, opts: { width?: number; quality?: number } = {}): Promise<Buffer> {
  let img = sharp(png).flatten({ background: '#ffffff' });
  if (opts.width) img = img.resize({ width: opts.width });
  return img.jpeg({ quality: opts.quality ?? 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
}
