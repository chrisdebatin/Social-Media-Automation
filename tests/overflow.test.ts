import { describe, expect, it } from 'vitest';
import { layoutSlide, overflowingSlots } from '../lib/templates';
import { measureText } from '../lib/measure';
import { canvas, headlineStyles } from '../lib/brand';
import { templateCatalog } from '../lib/schema';
import { allTemplates, slideWith } from './fixtures';

const ctx = { index: 1, total: 6, photoAspect: 1000 / 1394 };

describe('no text overflow – every template with min- and max-length German text', () => {
  for (const t of allTemplates) {
    for (const len of ['min', 'max'] as const) {
      for (const seed of [0, 1, 2]) {
        it(`${t} / ${len} / seed ${seed}`, () => {
          const s = slideWith(t, len, seed);
          const L = layoutSlide(s, ctx);
          expect(overflowingSlots(L)).toEqual([]);
          for (const b of L.texts) {
            // re-measure every rendered line against its box
            b.fit.lines.forEach((line, i) => {
              const w = measureText(b.fit.font, b.fit.size, line) + (b.fit.offsets?.[i] ?? 0);
              if (s.headlineStyle === 'vertikal' && b.slot === 'headline') return;
              expect(w, `${b.slot} line "${line}"`).toBeLessThanOrEqual(b.w + 0.5);
              expect(b.x + w, `${b.slot} right edge`).toBeLessThanOrEqual(canvas.width);
            });
            expect(b.fit.height, `${b.slot} height`).toBeLessThanOrEqual(b.h + 0.5);
            expect(b.y + b.fit.height, `${b.slot} bottom`).toBeLessThanOrEqual(canvas.height);
            expect(b.y, `${b.slot} top`).toBeGreaterThanOrEqual(0);
          }
        });
      }
    }
  }

  it('all allowed headline styles fit with max-length text', () => {
    for (const t of allTemplates) {
      for (const style of templateCatalog[t].headlineStyles.filter((x) => x !== 'vertikal')) {
        const s = { ...slideWith(t, 'max'), headlineStyle: style };
        expect(overflowingSlots(layoutSlide(s, ctx)), `${t}/${style}`).toEqual([]);
      }
    }
    expect(headlineStyles).toContain('eingerueckt');
  });

  it('vertical headline fits for a single 14-char word', () => {
    const s = { ...slideWith('statement', 'max'), headline: 'Gemeinschaften', headlineStyle: 'vertikal' as const };
    expect(overflowingSlots(layoutSlide(s, ctx))).toEqual([]);
  });

  it('headline sizes respect 2–4× copy size', () => {
    for (const t of allTemplates) {
      const L = layoutSlide(slideWith(t, 'max'), ctx);
      const hl = L.texts.find((b) => b.slot === 'headline');
      if (!hl || t === 'statement') continue;
      expect(hl.fit.size).toBeGreaterThanOrEqual(72);
      expect(hl.fit.size).toBeLessThanOrEqual(144);
    }
  });

  it('detects real overflow', () => {
    const s = { ...slideWith('cover', 'max'), headline: 'Donaudampfschifffahrtsgesellschaftskapitänswitwe '.repeat(3) };
    expect(overflowingSlots(layoutSlide(s, ctx))).toContain('headline');
  });
});
