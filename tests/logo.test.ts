import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderSlide } from '../lib/render';
import { logo, logoEdge, logoHeight, logoX } from '../lib/brand';
import { LOGO_TOP_Y, logoBandBottom } from '../lib/templates';
import { slideWith } from './fixtures';

/** Waldgrün #006937 – allow anti-aliasing tolerance; Apfelgrün #b4d214 must never appear here. */
const isWaldgruen = ([r, g, b]: number[]) => r < 40 && g > 80 && g < 130 && b > 30 && b < 80;

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (Math.round(y) * info.width + Math.round(x)) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

describe('white logo only on Waldgrün', () => {
  it('logo band covers the logo and its protection zone for any seed', () => {
    for (let k = 0; k < 200; k++) {
      // band edge must be at least X above the logo
      expect(logoBandBottom(`seed-${k}-band`)).toBeLessThanOrEqual(LOGO_TOP_Y - logoX);
    }
  });

  for (const t of ['cover', 'photo', 'statement'] as const) {
    it(`${t}: background around the white logo is Waldgrün`, async () => {
      const { png } = await renderSlide(slideWith(t, 'max'), { index: 0, total: 3 });
      const probes: [number, number][] = [
        [logoEdge + logo.width + logoX * 0.6, LOGO_TOP_Y + logoHeight / 2], // right of the logo
        [logoEdge / 2, LOGO_TOP_Y + logoHeight / 2], // left of the logo
        [logoEdge + logo.width / 2, LOGO_TOP_Y - logoX * 0.6], // above (protection zone)
        [logoEdge + logo.width / 2, LOGO_TOP_Y + logoHeight + logoX * 0.6], // below
      ];
      for (const [x, y] of probes) {
        const px = await pixel(png, x, y);
        expect(isWaldgruen(px), `${t} at ${Math.round(x)},${Math.round(y)} = rgb(${px.join(',')})`).toBe(true);
      }
    });
  }
});
