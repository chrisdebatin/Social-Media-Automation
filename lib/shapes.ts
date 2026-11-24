/**
 * Procedural brand shapes (Brand Book p.38–39): calm one-dimensional waves ("Wellen") and organic
 * blobs ("Kleckse"). Few anchor points + Catmull-Rom smoothing → no hard edges, no tight angles.
 * A seeded PRNG makes the same slide always produce the same shape.
 */

type Pt = [number, number];

export function hashSeed(input: string | number): number {
  const s = String(input);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 */
export function rng(seed: string | number): () => number {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** Catmull-Rom (uniform, tension 0.5) through points → cubic Bézier segments. */
function catmullRom(points: Pt[], closed: boolean): string {
  const n = points.length;
  const at = (i: number): Pt =>
    closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + ' Z' : d;
}

export interface WaveOptions {
  width: number;
  height: number;
  /** y of the wave edge at the left / right border (the wave may rise across the slide). */
  yLeft: number;
  yRight: number;
  /** max. vertical deviation of the anchors from the straight line */
  amplitude: number;
  seed: string | number;
  /** which side is filled */
  fill: 'below' | 'above';
  /** number of inner anchor points – keep it small (2–3) for calm curves */
  anchors?: number;
}

/** Points of the wave edge (exported so templates can compute the wave height at a given x). */
export function wavePoints(o: WaveOptions): Pt[] {
  const r = rng(o.seed);
  const anchors = o.anchors ?? 2;
  const pts: Pt[] = [];
  const x0 = -o.width * 0.15;
  const x1 = o.width * 1.15;
  const count = anchors + 2;
  const phase = r() < 0.5 ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = x0 + (x1 - x0) * t;
    const base = o.yLeft + (o.yRight - o.yLeft) * Math.min(1, Math.max(0, (x - 0) / o.width));
    // alternate up/down → one calm undulation, never a zig-zag
    const sign = i % 2 === 0 ? phase : -phase;
    const dev = i === 0 || i === count - 1 ? 0.35 : 0.7 + 0.3 * r();
    pts.push([x, base + sign * o.amplitude * dev]);
  }
  return pts;
}

export function wavePath(o: WaveOptions): string {
  const pts = wavePoints(o);
  const edge = catmullRom(pts, false);
  const yClose = o.fill === 'below' ? o.height + 20 : -20;
  const last = pts[pts.length - 1];
  return `${edge} L${f(last[0])} ${yClose} L${f(pts[0][0])} ${yClose} Z`;
}

/** Highest point (min y) of a filled-below wave edge – conservative, for layout. */
export function waveTop(o: WaveOptions): number {
  return Math.min(...wavePoints(o).map((p) => p[1])) - 2;
}
/** Lowest point (max y) of a filled-above wave edge – conservative, for layout. */
export function waveBottom(o: WaveOptions): number {
  return Math.max(...wavePoints(o).map((p) => p[1])) + 2;
}

export interface BlobOptions {
  /** bounding box the blob must stay inside */
  width: number;
  height: number;
  seed: string | number;
  /** number of anchors – 5 to 7 keeps it organic but calm */
  points?: number;
  /** 0 … 0.2 radial irregularity */
  irregularity?: number;
}

/** Organic closed blob that fits inside (0,0)–(width,height). */
export function blobPath(o: BlobOptions): string {
  const r = rng(o.seed);
  const n = o.points ?? 6;
  const irr = o.irregularity ?? 0.1;
  const cx = o.width / 2;
  const cy = o.height / 2;
  // Catmull-Rom overshoots slightly → keep a safety margin
  const rx = (o.width / 2) * (1 - irr) * 0.94;
  const ry = (o.height / 2) * (1 - irr) * 0.94;
  const rot = r() * Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2 + (r() - 0.5) * (Math.PI / n) * 0.5;
    const k = 1 + irr * (r() * 2 - 1);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return catmullRom(pts, true);
}
