import { NextResponse } from 'next/server';
import { z } from 'zod';
import { carouselSchema, fullCaption } from '@/lib/schema';
import { renderSlide, toJpeg } from '@/lib/render';
import { blobEnabled, putFile } from '@/lib/storage';
import { instagramEnabled, publish, publishingQuota, InstagramError } from '@/lib/instagram';
import { errorsOnly, formatIssues, validateCarousel } from '@/lib/validate';
import { layoutSlide, overflowingSlots } from '@/lib/templates';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Remaining publishing quota (24 h rolling window). */
export async function GET() {
  if (!instagramEnabled()) return jsonError('Instagram ist nicht konfiguriert.', 503);
  try {
    return NextResponse.json(await publishingQuota());
  } catch (e) {
    return jsonError(e, 502);
  }
}

export async function POST(req: Request) {
  if (!instagramEnabled()) return jsonError('Instagram ist nicht konfiguriert (IG_USER_ID, IG_ACCESS_TOKEN).', 503);
  if (!blobEnabled()) return jsonError('Für Instagram wird Vercel Blob benötigt (öffentliche Bild-URLs).', 503);
  let carousel;
  try {
    ({ carousel } = z.object({ carousel: carouselSchema }).parse(await req.json()));
  } catch (e) {
    return jsonError(e);
  }
  const n = carousel.slides.length;
  const errors = errorsOnly(
    validateCarousel(carousel, { mode: 'manual', overflow: (s, i, t) => overflowingSlots(layoutSlide(s, { index: i, total: t })) }),
  );
  if (errors.length) return jsonError(`Bitte zuerst korrigieren:\n${formatIssues(errors)}`, 422);

  try {
    const stamp = Date.now();
    const images: { url: string; ai: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const s = carousel.slides[i];
      const { png } = await renderSlide(s, { index: i, total: n });
      const jpg = await toJpeg(png);
      const url = await putFile(`posts/${stamp}/slide-${i + 1}.jpg`, jpg, 'image/jpeg');
      images.push({ url, ai: !!s.photo?.ai });
    }
    const result = await publish(images, fullCaption(carousel));
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e, e instanceof InstagramError ? 502 : 500);
  }
}
