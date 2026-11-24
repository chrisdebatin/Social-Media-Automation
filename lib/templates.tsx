/**
 * Slide templates (1080×1350, Satori-compatible JSX).
 *
 * Each template = layout() (pure geometry + text fitting with real font metrics) + render() (JSX).
 * The AI never designs: it only fills slots. Colours/fonts come from lib/brand.ts, shapes from lib/shapes.ts.
 * Satori rule: every div with more than one child needs display:flex.
 */
import React from 'react';
import {
  canvas, colors, fonts, type, logo, logoX, logoHeight, logoEdge, roundMarkSize, pad,
  type HeadlineStyle, website,
} from './brand';
import { blobPath, wavePath, waveBottom, waveTop, type WaveOptions } from './shapes';
import { fitIndented, fitText, measureText, type FitResult, type FontKey } from './measure';
import { templateCatalog, type Slide, type TemplateId } from './schema';

const W = canvas.width;
const H = canvas.height;
const P = pad;
const TW = W - 2 * P;
const LOGO_TOP = H - logoEdge - logoHeight;
const MARK_TOP = H - P - roundMarkSize;
/** Text must end at least 1 X above a footer logo / round mark (Schutzzone). */
const FOOTER_LIMIT = Math.min(LOGO_TOP, MARK_TOP) - Math.ceil(logoX);

/* ------------------------------------------------------------------ types */

export interface TextBox {
  slot: string;
  fit: FitResult;
  x: number;
  y: number;
  /** available width / height of the box – the overflow test checks fit against these */
  w: number;
  h: number;
  color: string;
}

export interface LayoutCtx {
  index: number;
  total: number;
  /** width/height of the slide photo (needed for cutouts) */
  photoAspect?: number;
}

export interface Layout<G = unknown> {
  texts: TextBox[];
  g: G;
}

export interface RenderAssets {
  logoHaupt: string;
  logoAlt: string;
  kreisHaupt: string;
  kreisAlt: string;
  photo: { src: string; width: number; height: number } | null;
}

interface TemplateDef<G> {
  layout: (s: Slide, ctx: LayoutCtx) => Layout<G>;
  render: (s: Slide, L: Layout<G>, a: RenderAssets, ctx: LayoutCtx) => React.ReactElement;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const define = <G,>(d: TemplateDef<G>) => d as TemplateDef<any>;

/* ---------------------------------------------------------------- helpers */

const FONT_CSS: Record<FontKey, { fontFamily: string; fontWeight: number }> = {
  regular: { fontFamily: fonts.sans, fontWeight: 400 },
  bold: { fontFamily: fonts.sans, fontWeight: 700 },
  extrabold: { fontFamily: fonts.sans, fontWeight: 800 },
  accent: { fontFamily: fonts.accent, fontWeight: 400 },
};

const box = (slot: string, fit: FitResult, x: number, y: number, w: number, h: number, color: string): TextBox => ({
  slot, fit, x, y, w, h, color,
});

function headlineFit(
  text: string,
  style: HeadlineStyle | undefined,
  o: { maxWidth: number; maxLines: number; maxSize?: number; maxHeight?: number },
): FitResult {
  const opts = {
    font: 'extrabold' as const,
    maxWidth: o.maxWidth,
    maxLines: o.maxLines,
    maxSize: o.maxSize ?? type.headline.max,
    minSize: type.headline.min,
    lineHeight: type.headline.lineHeight,
    maxHeight: o.maxHeight,
  };
  if (style === 'eingerueckt') {
    return fitIndented(text, { ...opts, indent: (size) => Math.min(size * 1.6, o.maxWidth * 0.22) });
  }
  return fitText(text, opts);
}

const sublineFit = (text: string, maxWidth: number, maxLines = 2) =>
  fitText(text, {
    font: 'bold', maxWidth, maxLines, maxSize: type.subline.size, minSize: type.subline.min,
    lineHeight: type.subline.lineHeight,
  });

const accentFit = (text: string, maxWidth: number, maxLines: number, maxSize = type.accent.size, maxHeight?: number) =>
  fitText(text, {
    font: 'accent', maxWidth, maxLines, maxSize, minSize: type.accent.min, lineHeight: type.accent.lineHeight, maxHeight,
  });

const has = (s?: string) => !!s && s.trim().length > 0;

/** Renders pre-wrapped lines – nothing is wrapped by the renderer. Always left-aligned. */
function Lines({ b }: { b: TextBox }) {
  const f = b.fit;
  return (
    <div style={{ position: 'absolute', left: b.x, top: b.y, display: 'flex', flexDirection: 'column' }}>
      {f.lines.map((line, i) => (
        <div
          key={i}
          style={{
            ...FONT_CSS[f.font],
            fontSize: f.size,
            lineHeight: `${f.lineHeightPx}px`,
            height: f.lineHeightPx,
            marginLeft: f.offsets?.[i] ?? 0,
            color: b.color,
            whiteSpace: 'nowrap',
            display: 'flex',
          }}
        >
          {line || ' '}
        </div>
      ))}
    </div>
  );
}

function Shape({ d, fill, x = 0, y = 0, w = W, h = H }: { d: string; fill: string; x?: number; y?: number; w?: number; h?: number }) {
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left: x, top: y }}>
      <path d={d} fill={fill} />
    </svg>
  );
}

function Wave({ o, fill }: { o: WaveOptions; fill: string }) {
  return <Shape d={wavePath(o)} fill={fill} />;
}

function Blob({ x, y, w, h, seed, fill, irregularity }: { x: number; y: number; w: number; h: number; seed: string; fill: string; irregularity?: number }) {
  return <Shape d={blobPath({ width: w, height: h, seed, irregularity })} fill={fill} x={x} y={y} w={w} h={h} />;
}

function PhotoBlob({ src, x, y, w, h, seed }: { src: string | null; x: number; y: number; w: number; h: number; seed: string }) {
  const d = blobPath({ width: w, height: h, seed, irregularity: 0.1 });
  if (!src) {
    return (
      <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, display: 'flex' }}>
        <Shape d={d} fill={colors.grau25} w={w} h={h} />
        <div style={{ position: 'absolute', left: w * 0.3, top: h * 0.45, fontFamily: fonts.sans, fontWeight: 700, fontSize: 40, color: colors.grau60 }}>
          Foto fehlt
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, display: 'flex', clipPath: `path("${d}")` }}>
      <img src={src} width={w} height={h} style={{ width: w, height: h, objectFit: 'cover' }} />
    </div>
  );
}

function Logo({ src, x = logoEdge, y = LOGO_TOP }: { src: string; x?: number; y?: number }) {
  // always proportional, never recoloured, always at the left edge
  return <img src={src} width={logo.width} height={logoHeight} style={{ position: 'absolute', left: x, top: y }} />;
}

function RoundMark({ src, size = roundMarkSize, x = P, y = MARK_TOP }: { src: string; size?: number; x?: number; y?: number }) {
  return <img src={src} width={size} height={size} style={{ position: 'absolute', left: x, top: y }} />;
}

function Frame({ bg = colors.weiss, children }: { bg?: string; children: React.ReactNode }) {
  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: bg, overflow: 'hidden', fontFamily: fonts.sans }}>
      {children}
    </div>
  );
}

function Counter({ ctx, color }: { ctx: LayoutCtx; color: string }) {
  return (
    <div style={{ position: 'absolute', left: P, top: P, fontFamily: fonts.sans, fontWeight: 700, fontSize: type.copy.size, color }}>
      {`${ctx.index + 1}/${ctx.total}`}
    </div>
  );
}

/** Top Apfelgrün wave used by text + list slides. */
const topWave = (seed: string): WaveOptions => ({
  width: W, height: H, yLeft: 196, yRight: 160, amplitude: 18, seed, fill: 'above',
});

/* ============================================================== templates */

/* ----------------------------------------------------------------- cover */
interface CoverG { wave: WaveOptions; photo: { x: number; y: number; w: number; h: number } }
const cover = define<CoverG>({
  layout(s) {
    const top = 96;
    const hl = headlineFit(s.headline ?? '', s.headlineStyle, { maxWidth: TW, maxLines: 4, maxSize: 128, maxHeight: 500 });
    const texts = [box('headline', hl, P, top, TW, 500, colors.waldgruen)];
    let bottom = top + hl.height;
    if (has(s.subline)) {
      const sub = sublineFit(s.subline!, TW, 2);
      texts.push(box('subline', sub, P, bottom + 24, TW, sub.lineHeightPx * 2, colors.schwarz));
      bottom += 24 + sub.height;
    }
    // photo adapts to the text height
    // photo adapts to the text height; it dips only slightly behind the wave
    const photoBottom = 1190;
    const ph = Math.max(470, Math.min(820, photoBottom - (bottom + 40)));
    const pw = Math.max(720, Math.min(900, ph * 1.12));
    const photo = { x: W - pw + 70, y: photoBottom - ph, w: pw, h: ph };
    const wave: WaveOptions = { width: W, height: H, yLeft: 1118, yRight: 1076, amplitude: 22, seed: `${s.id}-w`, fill: 'below' };
    return { texts, g: { wave, photo } };
  },
  render(s, L, a) {
    const { photo, wave } = L.g;
    return (
      <Frame>
        <Blob x={photo.x - 70} y={photo.y + 40} w={photo.w} h={photo.h} seed={`${s.id}-g`} fill={colors.grau15} />
        <PhotoBlob src={a.photo?.src ?? null} {...photo} seed={`${s.id}-p`} />
        <Wave o={wave} fill={colors.apfelgruen} />
        <Logo src={a.logoAlt} />
        {L.texts.map((b) => <Lines key={b.slot} b={b} />)}
      </Frame>
    );
  },
});

/* ----------------------------------------------------------------- photo */
interface PhotoG { wave: WaveOptions }
const photo = define<PhotoG>({
  layout(s) {
    const hl = headlineFit(s.headline ?? '', s.headlineStyle, { maxWidth: TW, maxLines: 3, maxSize: 96, maxHeight: 340 });
    const sub = has(s.subline) ? sublineFit(s.subline!, TW, 2) : null;
    const textH = hl.height + (sub ? 20 + sub.height : 0);
    const textBottom = LOGO_TOP - 2 * logoX;
    const textTop = textBottom - textH;
    const texts = [box('headline', hl, P, textTop, TW, 340, colors.waldgruen)];
    if (sub) texts.push(box('subline', sub, P, textTop + hl.height + 20, TW, sub.lineHeightPx * 2, colors.schwarz));
    const amp = 20;
    const base = textTop - 36 - amp;
    const wave: WaveOptions = { width: W, height: H, yLeft: base, yRight: base - 24, amplitude: amp, seed: `${s.id}-w`, fill: 'below' };
    return { texts, g: { wave } };
  },
  render(s, L, a) {
    return (
      <Frame bg={colors.grau25}>
        {a.photo ? (
          <img src={a.photo.src} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', left: P, top: 300, fontSize: 48, fontWeight: 700, color: colors.grau60 }}>Foto fehlt</div>
        )}
        <Wave o={L.g.wave} fill={colors.apfelgruen} />
        <Logo src={a.logoAlt} />
        {L.texts.map((b) => <Lines key={b.slot} b={b} />)}
      </Frame>
    );
  },
});

/* ------------------------------------------------------------------ text */
interface TextG { wave: WaveOptions; ruleY: number }
const text = define<TextG>({
  layout(s) {
    const wave = topWave(`${s.id}-w`);
    const hlTop = waveBottom(wave) + 56;
    const hl = headlineFit(s.headline ?? '', s.headlineStyle, { maxWidth: TW, maxLines: 3, maxSize: 108, maxHeight: 360 });
    const ruleY = hlTop + hl.height + 28;
    const bodyTop = ruleY + 10 + 40;
    const bodyH = FOOTER_LIMIT - bodyTop;
    const body = fitText(s.body ?? '', {
      font: 'regular', maxWidth: TW, maxLines: 14, maxSize: type.copy.size + 4, minSize: type.copy.size - 4,
      lineHeight: type.copy.lineHeight, maxHeight: bodyH,
    });
    return {
      texts: [box('headline', hl, P, hlTop, TW, 360, colors.waldgruen), box('body', body, P, bodyTop, TW, bodyH, colors.schwarz)],
      g: { wave, ruleY },
    };
  },
  render(s, L, a, ctx) {
    return (
      <Frame>
        <Blob x={W - 400} y={H - 420} w={560} h={520} seed={`${s.id}-g`} fill={colors.grau15} />
        <Wave o={L.g.wave} fill={colors.apfelgruen} />
        <Counter ctx={ctx} color={colors.waldgruen} />
        <div style={{ position: 'absolute', left: P, top: L.g.ruleY, width: 96, height: 10, borderRadius: 5, background: colors.apfelgruen }} />
        <RoundMark src={a.kreisHaupt} />
        {L.texts.map((b) => <Lines key={b.slot} b={b} />)}
      </Frame>
    );
  },
});

/* ------------------------------------------------------------- statement */
interface StatementG { wave: WaveOptions; vertical: { x: number; y: number } | null }
const statement = define<StatementG>({
  layout(s) {
    const style = s.headlineStyle ?? 'eingerueckt';
    const wave: WaveOptions = { width: W, height: H, yLeft: 1132, yRight: 1088, amplitude: 20, seed: `${s.id}-w`, fill: 'below' };
    const top = P + 40;
    const bottom = waveTop(wave) - 60;
    const regionH = bottom - top;
    const texts: TextBox[] = [];

    if (style === 'vertikal') {
      const word = (s.headline ?? '').trim();
      const single = !/\s/.test(word) && word.length <= 14;
      let size = 230;
      while (size > 120 && measureText('extrabold', size, word) > regionH - 40) size -= 4;
      const len = measureText('extrabold', size, word);
      const lh = size * type.headline.lineHeight;
      const fit: FitResult = {
        fits: single && len <= regionH, size, lines: [word], lineHeightPx: lh, height: len, width: lh, font: 'extrabold',
      };
      const anchorY = top + (regionH + len) / 2;
      // rotated box: x ∈ [P, P+lh], y ∈ [anchorY-len, anchorY]
      texts.push({ slot: 'headline', fit, x: P, y: anchorY - len, w: lh, h: regionH, color: colors.weiss });
      if (has(s.accent)) {
        const ax = P + lh + 48;
        const acc = accentFit(s.accent!, W - P - ax, 5, 76, regionH);
        texts.push(box('accent', acc, ax, top + (regionH - acc.height) / 2, W - P - ax, regionH, colors.waldgruen));
      }
      return { texts, g: { wave, vertical: { x: P, y: anchorY } } };
    }

    const hl = headlineFit(s.headline ?? '', style, { maxWidth: TW, maxLines: 4, maxSize: 136, maxHeight: 620 });
    const acc = has(s.accent) ? accentFit(s.accent!, TW, 2, 88) : null;
    const blockH = hl.height + (acc ? 36 + acc.height : 0);
    const y0 = top + Math.max(0, (regionH - blockH) / 2);
    texts.push(box('headline', hl, P, y0, TW, 620, colors.weiss));
    if (acc) texts.push(box('accent', acc, P, y0 + hl.height + 36, TW, acc.lineHeightPx * 2, colors.waldgruen));
    return { texts, g: { wave, vertical: null } };
  },
  render(s, L, a) {
    const v = L.g.vertical;
    return (
      <Frame bg={colors.apfelgruen}>
        <Wave o={L.g.wave} fill={colors.waldgruen} />
        <Logo src={a.logoAlt} />
        {L.texts.map((b) => {
          if (v && b.slot === 'headline') {
            return (
              <div
                key="v"
                style={{
                  position: 'absolute', left: v.x, top: v.y, display: 'flex', transform: 'rotate(-90deg)', transformOrigin: 'top left',
                  ...FONT_CSS.extrabold, fontSize: b.fit.size, lineHeight: `${b.fit.lineHeightPx}px`, color: b.color, whiteSpace: 'nowrap',
                }}
              >
                {b.fit.lines[0]}
              </div>
            );
          }
          return <Lines key={b.slot} b={b} />;
        })}
      </Frame>
    );
  },
});

/* ----------------------------------------------------------------- quote */
interface QuoteG { markY: number }
const quote = define<QuoteG>({
  layout(s) {
    const regionTop = 330;
    const author = sublineFit(`– ${s.author ?? ''}`, TW, 2);
    const maxQuoteH = FOOTER_LIMIT - regionTop - 40 - author.height;
    const q = accentFit(s.quote ?? '', TW - 20, 7, 86, maxQuoteH);
    const blockH = q.height + 40 + author.height;
    const y0 = regionTop + Math.max(0, (FOOTER_LIMIT - regionTop - blockH) / 2);
    return {
      texts: [
        box('quote', q, P, y0, TW - 20, maxQuoteH, colors.waldgruen),
        box('author', author, P, y0 + q.height + 40, TW, author.lineHeightPx * 2, colors.schwarz),
      ],
      g: { markY: y0 - 300 },
    };
  },
  render(s, L, a) {
    return (
      <Frame>
        <Blob x={-90} y={150} w={1080} h={1000} seed={`${s.id}-g`} fill={colors.grau15} irregularity={0.08} />
        <div style={{ position: 'absolute', left: P - 8, top: L.g.markY, ...FONT_CSS.extrabold, fontSize: 300, lineHeight: '300px', color: colors.apfelgruen }}>
          „
        </div>
        <RoundMark src={a.kreisHaupt} />
        {L.texts.map((b) => <Lines key={b.slot} b={b} />)}
      </Frame>
    );
  },
});

/* ------------------------------------------------------------------ team */
interface TeamG { person: { x: number; y: number; w: number; h: number }; blob: { x: number; y: number; w: number; h: number }; kickerY: number }
export const TEAM_KICKER = 'Kennst du schon …';
const team = define<TeamG>({
  layout(s, ctx) {
    const kickerY = P;
    const kicker = accentFit(TEAM_KICKER, TW, 1, 76);
    let y = kickerY + kicker.height + 4;
    const name = headlineFit(s.headline ?? '', 'standard', { maxWidth: TW, maxLines: 2, maxSize: 112, maxHeight: 260 });
    const texts: TextBox[] = [box('kicker', kicker, P, kickerY, TW, kicker.height, colors.waldgruen), box('headline', name, P, y, TW, 260, colors.waldgruen)];
    y += name.height + 12;
    const role = sublineFit(s.subline ?? '', TW, 2);
    texts.push(box('subline', role, P, y, TW, role.lineHeightPx * 2, colors.schwarz));
    y += role.height;

    const aspect = ctx.photoAspect ?? 0.72;
    const personTop = Math.max(y + 28, H - 960);
    const ph = H - personTop;
    const pw = ph * aspect;
    const person = { x: W - pw + pw * 0.06, y: personTop, w: pw, h: ph };
    // the blob peeks out around head and shoulders
    const bw = pw * 1.22;
    const blob = { x: person.x - pw * 0.1, y: personTop - ph * 0.04, w: bw, h: Math.min(bw * 0.95, ph * 0.8) };

    if (has(s.accent)) {
      const colW = Math.max(300, person.x - P - 28);
      const maxH = FOOTER_LIMIT - (y + 60);
      const acc = accentFit(s.accent!, colW, 7, 58, maxH);
      texts.push(box('accent', acc, P, FOOTER_LIMIT - acc.height, colW, maxH, colors.waldgruen));
    }
    return { texts, g: { person, blob, kickerY } };
  },
  render(s, L, a) {
    const { person, blob } = L.g;
    return (
      <Frame>
        <Blob x={blob.x - 120} y={blob.y + blob.h * 0.45} w={blob.w * 0.6} h={blob.h * 0.55} seed={`${s.id}-g`} fill={colors.grau15} />
        <Blob {...blob} seed={`${s.id}-b`} fill={colors.apfelgruen} />
        {a.photo ? (
          <img src={a.photo.src} width={person.w} height={person.h} style={{ position: 'absolute', left: person.x, top: person.y, width: person.w, height: person.h, objectFit: 'contain', objectPosition: 'bottom' }} />
        ) : (
          <div style={{ position: 'absolute', left: blob.x + blob.w * 0.25, top: blob.y + blob.h * 0.45, fontSize: 40, fontWeight: 700, color: colors.waldgruen }}>Porträt fehlt</div>
        )}
        <RoundMark src={a.kreisHaupt} />
        {L.texts.map((b) => <Lines key={b.slot} b={b} />)}
      </Frame>
    );
  },
});

/* ------------------------------------------------------------------ list */
interface ListG { wave: WaveOptions; markers: number[]; markerSize: number }
const list = define<ListG>({
  layout(s) {
    const wave = topWave(`${s.id}-w`);
    const hlTop = waveBottom(wave) + 56;
    const hl = headlineFit(s.headline ?? '', 'standard', { maxWidth: TW, maxLines: 2, maxSize: 104, maxHeight: 240 });
    const top = hlTop + hl.height + 64;
    const items = (s.bullets ?? []).filter(has);
    const markerSize = 48;
    const indent = markerSize + 28;
    const gap = 30;
    const maxH = FOOTER_LIMIT - top;
    let fits: FitResult[] = [];
    for (let size = type.subline.size + 2; size >= type.copy.size - 2; size -= 2) {
      fits = items.map((t) => fitText(t, { font: 'bold', maxWidth: TW - indent, maxLines: 2, maxSize: size, minSize: size, lineHeight: type.subline.lineHeight }));
      const total = fits.reduce((h, f) => h + f.height, 0) + gap * Math.max(0, fits.length - 1);
      if (fits.every((f) => f.fits) && total <= maxH) break;
    }
    const texts: TextBox[] = [box('headline', hl, P, hlTop, TW, 240, colors.waldgruen)];
    const markers: number[] = [];
    let y = top;
    fits.forEach((f, i) => {
      texts.push(box(`bullets.${i}`, f, P + indent, y, TW - indent, Math.max(0, FOOTER_LIMIT - y), colors.schwarz));
      markers.push(y + (f.lineHeightPx - markerSize) / 2);
      y += f.height + gap;
    });
    return { texts, g: { wave, markers, markerSize } };
  },
  render(s, L, a, ctx) {
    const m = L.g.markerSize;
    return (
      <Frame>
        <Blob x={W - 360} y={H - 400} w={520} h={500} seed={`${s.id}-g`} fill={colors.grau15} />
        <Wave o={L.g.wave} fill={colors.apfelgruen} />
        <Counter ctx={ctx} color={colors.waldgruen} />
        {L.g.markers.map((y, i) => (
          <svg key={i} width={m} height={m} viewBox="0 0 48 48" style={{ position: 'absolute', left: P, top: y }}>
            <circle cx="24" cy="24" r="24" fill={colors.apfelgruen} />
            <path d="M13 25 L21 33 L35 16" stroke={colors.weiss} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ))}
        <RoundMark src={a.kreisHaupt} />
        {L.texts.map((b) => <Lines key={b.slot} b={b} />)}
      </Frame>
    );
  },
});

/* ------------------------------------------------------------------- cta */
interface CtaG { button: { x: number; y: number; w: number; h: number }; blob: { x: number; y: number; w: number; h: number } }
const cta = define<CtaG>({
  layout(s) {
    const top = 96;
    const hl = headlineFit(s.headline ?? '', s.headlineStyle, { maxWidth: TW, maxLines: 3, maxSize: 120, maxHeight: 400 });
    const texts: TextBox[] = [box('headline', hl, P, top, TW, 400, colors.waldgruen)];
    let y = top + hl.height;
    if (has(s.subline)) {
      const sub = sublineFit(s.subline!, TW, 3);
      texts.push(box('subline', sub, P, y + 24, TW, sub.lineHeightPx * 3, colors.schwarz));
      y += 24 + sub.height;
    }
    const padX = 44;
    const padY = 24;
    const maxBtnW = 430;
    const btn = fitText(s.button ?? '', { font: 'bold', maxWidth: maxBtnW - 2 * padX, maxLines: 1, maxSize: 42, minSize: 32, lineHeight: 1.2 });
    const button = { x: P, y: y + 52, w: Math.min(maxBtnW, btn.width + 2 * padX), h: btn.height + 2 * padY };
    texts.push(box('button', btn, P + padX, button.y + padY, maxBtnW - 2 * padX, btn.lineHeightPx, colors.weiss));
    const url = fitText(website, { font: 'bold', maxWidth: maxBtnW, maxLines: 1, maxSize: 40, minSize: 40, lineHeight: 1.2 });
    texts.push(box('url', url, P, button.y + button.h + 28, maxBtnW, url.height, colors.waldgruen));

    const blobTop = Math.max(y + 40, 470);
    const blobBottom = LOGO_TOP - 2 * logoX;
    const bh = Math.max(440, blobBottom - blobTop);
    const blob = { x: 540, y: blobBottom - bh, w: 620, h: bh };
    return { texts, g: { button, blob } };
  },
  render(s, L, a) {
    const { button: b, blob } = L.g;
    const mark = Math.min(blob.w, blob.h) * 0.56;
    return (
      <Frame>
        <Blob {...blob} seed={`${s.id}-b`} fill={colors.apfelgruen} />
        <RoundMark src={a.kreisHaupt} size={mark} x={blob.x + (Math.min(blob.w, W - blob.x) - mark) / 2} y={blob.y + (blob.h - mark) / 2} />
        <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: b.h / 2, background: colors.waldgruen }} />
        <Logo src={a.logoHaupt} />
        {L.texts.map((t) => <Lines key={t.slot} b={t} />)}
      </Frame>
    );
  },
});

/* ============================================================== registry */

const templates: Record<TemplateId, TemplateDef<unknown>> = { cover, photo, text, statement, quote, team, list, cta };

export function layoutSlide(s: Slide, ctx: LayoutCtx): Layout {
  return templates[s.template].layout(s, ctx);
}

export function renderSlideElement(s: Slide, L: Layout, a: RenderAssets, ctx: LayoutCtx): React.ReactElement {
  return templates[s.template].render(s, L, a, ctx);
}

/** Text boxes that do not fit (for validation + overflow test). */
export function overflowingSlots(L: Layout): string[] {
  return L.texts
    .filter((t) => !t.fit.fits || t.fit.width > t.w + 0.5 || t.fit.height > t.h + 0.5)
    .map((t) => t.slot);
}

export { templateCatalog };
