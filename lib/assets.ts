import fs from 'node:fs';
import path from 'node:path';

export const ASSET_ROOT = path.join(process.cwd(), 'assets');

export function assetPath(rel: string): string {
  const p = path.normalize(path.join(ASSET_ROOT, rel));
  if (!p.startsWith(ASSET_ROOT + path.sep)) throw new Error('Ungültiger Asset-Pfad');
  return p;
}

export function readAsset(rel: string): Buffer {
  return fs.readFileSync(assetPath(rel));
}

export function assetExists(rel: string): boolean {
  try {
    return fs.statSync(assetPath(rel)).isFile();
  } catch {
    return false;
  }
}

const NIFTY_CANDIDATES = ['fonts/NiftyScript.otf', 'fonts/NiftyScript.ttf', 'fonts/NiftyScript.woff'];

/** Licensed Nifty Script if present, else the free Caveat fallback. */
export function accentFontFile(): { file: string; licensed: boolean } {
  const nifty = NIFTY_CANDIDATES.find(assetExists);
  return nifty ? { file: nifty, licensed: true } : { file: 'fonts/Caveat-Regular.woff', licensed: false };
}

export interface PersonAsset {
  id: string; // e.g. "mike"
  name: string; // e.g. "Mike"
  src: string; // "asset:people/mike.png"
}

export function listPeople(): PersonAsset[] {
  const dir = path.join(ASSET_ROOT, 'people');
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => /\.(png|webp)$/i.test(f))
    .sort()
    .map((f) => {
      const id = f.replace(/\.[^.]+$/, '');
      const name = id.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
      return { id, name, src: `asset:people/${f}` };
    });
}
