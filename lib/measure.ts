/**
 * Exact text measurement with the real font files (opentype.js).
 *
 * We do NOT use font.getAdvanceWidth(): it runs the GSUB shaper, which crashes on Nunito Sans' lookups.
 * Instead we sum glyph advance widths and add pair kerning ourselves. To be safe against renderer
 * differences (Satori may or may not kern), a string's width is max(kerned, unkerned).
 *
 * Line breaking is done HERE, not by the renderer: templates render each computed line as its own
 * nowrap element, so what we measure is exactly what gets drawn.
 */
import opentype from 'opentype.js';
import { readAsset, accentFontFile } from './assets';

export type FontKey = 'regular' | 'bold' | 'extrabold' | 'accent';

const FILES: Record<Exclude<FontKey, 'accent'>, string> = {
  regular: 'fonts/NunitoSans-Regular.woff',
  bold: 'fonts/NunitoSans-Bold.woff',
  extrabold: 'fonts/NunitoSans-ExtraBold.woff',
};

const fontCache = new Map<FontKey, opentype.Font>();
const advCache = new Map<string, number>();

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export function getFont(key: FontKey): opentype.Font {
  let font = fontCache.get(key);
  if (!font) {
    const file = key === 'accent' ? accentFontFile().file : FILES[key];
    font = opentype.parse(toArrayBuffer(readAsset(file)));
    fontCache.set(key, font);
  }
  return font;
}

/** Width of `text` in px at `size`. */
export function measureText(key: FontKey, size: number, text: string): number {
  const font = getFont(key);
  let plain = 0;
  let kern = 0;
  let prev: opentype.Glyph | null = null;
  for (const ch of text) {
    const ck = key + ch;
    let adv = advCache.get(ck);
    const glyph = font.charToGlyph(ch);
    if (adv === undefined) {
      adv = glyph.advanceWidth ?? font.unitsPerEm * 0.5;
      advCache.set(ck, adv);
    }
    plain += adv;
    if (prev) {
      try {
        kern += font.getKerningValue(prev, glyph) || 0;
      } catch {
        /* some fonts have no usable kern data */
      }
    }
    prev = glyph;
  }
  const units = Math.max(plain, plain + kern);
  return (units * size) / font.unitsPerEm;
}

interface Segment {
  text: string; // includes trailing hyphen if split after "-"
  space: boolean; // a space precedes this segment
}

function segments(paragraph: string): Segment[] {
  const out: Segment[] = [];
  const words = paragraph.split(/ +/).filter(Boolean);
  for (const word of words) {
    // allow breaks after hyphens inside compounds ("Intensivpflege-Wohngemeinschaft")
    const parts = word.split(/(?<=-)(?=\p{L})/u);
    parts.forEach((p, i) => out.push({ text: p, space: i === 0 && out.length > 0 }));
  }
  return out;
}

/** Greedy wrap. Returns null if a single segment is wider than maxWidth. */
export function wrapText(key: FontKey, size: number, text: string, maxWidth: number): string[] | null {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const segs = segments(paragraph.trim());
    if (segs.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const s of segs) {
      if (measureText(key, size, s.text) > maxWidth) return null;
      const candidate = line === '' ? s.text : line + (s.space ? ' ' : '') + s.text;
      if (line !== '' && measureText(key, size, candidate) > maxWidth) {
        lines.push(line);
        line = s.text;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface FitOptions {
  font: FontKey;
  maxWidth: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  lineHeight: number;
  /** optional height limit for the block */
  maxHeight?: number;
  step?: number;
}

export interface FitResult {
  fits: boolean;
  size: number;
  lines: string[];
  /** px line height */
  lineHeightPx: number;
  height: number;
  /** widest line in px */
  width: number;
  font: FontKey;
  /** per-line horizontal offset (used by indented headlines) */
  offsets?: number[];
}

/** Largest font size (from maxSize down to minSize) at which `text` fits into the box. */
export function fitText(text: string, o: FitOptions): FitResult {
  const step = o.step ?? 2;
  let last: FitResult | null = null;
  for (let size = o.maxSize; size >= o.minSize; size -= step) {
    const lines = wrapText(o.font, size, text, o.maxWidth);
    const lh = size * o.lineHeight;
    if (!lines) {
      last = { fits: false, size, lines: [text], lineHeightPx: lh, height: lh, width: Infinity, font: o.font };
      continue;
    }
    const height = lines.length * lh;
    const width = Math.max(0, ...lines.map((l) => measureText(o.font, size, l)));
    const res: FitResult = { fits: true, size, lines, lineHeightPx: lh, height, width, font: o.font };
    if (lines.length <= o.maxLines && (o.maxHeight === undefined || height <= o.maxHeight)) return res;
    last = { ...res, fits: false };
  }
  return last ?? { fits: false, size: o.minSize, lines: [text], lineHeightPx: 0, height: 0, width: Infinity, font: o.font };
}

/**
 * Indented headline ("eingerückt", Brand Book p.36): line 1 flush left, line 2 indented.
 * Prefers exactly one line per part; falls back to wrapping inside each part.
 */
export function fitIndented(
  text: string,
  o: FitOptions & { indent: (size: number) => number },
): FitResult {
  const parts = splitForIndent(text, o.font, o.maxWidth);
  if (parts.length < 2) return fitText(text, o);
  const step = o.step ?? 2;
  const tryFit = (allowWrap: boolean): FitResult | null => {
    for (let size = o.maxSize; size >= o.minSize; size -= step) {
      const ind = o.indent(size);
      const l1 = wrapText(o.font, size, parts[0], o.maxWidth);
      const l2 = wrapText(o.font, size, parts[1], o.maxWidth - ind);
      if (!l1 || !l2) continue;
      if (!allowWrap && (l1.length > 1 || l2.length > 1)) continue;
      const lines = [...l1, ...l2];
      const lh = size * o.lineHeight;
      const height = lines.length * lh;
      if (lines.length > o.maxLines || (o.maxHeight !== undefined && height > o.maxHeight)) continue;
      const offsets = [...l1.map(() => 0), ...l2.map(() => ind)];
      const width = Math.max(...lines.map((l, i) => measureText(o.font, size, l) + offsets[i]));
      return { fits: true, size, lines, lineHeightPx: lh, height, width, font: o.font, offsets };
    }
    return null;
  };
  // one line per part, but only if that doesn't force the size to the minimum
  const strict = tryFit(false);
  if (strict && strict.size >= o.minSize + (o.maxSize - o.minSize) * 0.25) return strict;
  const loose = tryFit(true);
  if (strict && (!loose || strict.size >= loose.size * 0.85)) return strict;
  if (loose) return loose;
  const fallback = fitText(text, o);
  return { ...fallback, fits: false };
}

/** Split headline into two parts: explicit "\n", otherwise the most balanced word split. */
export function splitForIndent(text: string, font: FontKey, maxWidth: number): string[] {
  const explicit = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (explicit.length >= 2) return [explicit[0], explicit.slice(1).join(' ')];
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return [text.trim()];
  let best = 1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = measureText(font, 100, words.slice(0, i).join(' '));
    // the second line is indented → give it a little less room
    const b = measureText(font, 100, words.slice(i).join(' ')) + maxWidth * 0.02;
    const score = Math.max(a, b);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
