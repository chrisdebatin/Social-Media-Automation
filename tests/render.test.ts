import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderSlide, toJpeg } from '../lib/render';
import { allTemplates, slideWith } from './fixtures';

describe('render smoke test (Satori → PNG → JPEG)', () => {
  for (const t of allTemplates) {
    for (const len of ['min', 'max'] as const) {
      it(`${t} / ${len}`, async () => {
        const { png, overflow } = await renderSlide(slideWith(t, len), { index: 1, total: 6 });
        expect(overflow).toEqual([]);
        const meta = await sharp(png).metadata();
        expect([meta.width, meta.height]).toEqual([1080, 1350]);
      });
    }
  }
  it('converts to JPEG for Instagram', async () => {
    const { png } = await renderSlide(slideWith('statement', 'min'), { index: 0, total: 1 });
    const jpg = await toJpeg(png);
    expect((await sharp(jpg).metadata()).format).toBe('jpeg');
  });
});
