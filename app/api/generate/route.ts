import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiTextEnabled, generateCarousel, generateInputSchema, rewriteInputSchema, rewriteSlide, RefusalError } from '@/lib/ai';
import { listPeople } from '@/lib/assets';
import { carouselSchema } from '@/lib/schema';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

const carouselBody = generateInputSchema.extend({
  mode: z.literal('carousel'),
  /** sources aligned with `photos` (asset:…, https://…, data:…) */
  photoSrcs: z.array(z.string()).max(20).default([]),
});
const slideBody = rewriteInputSchema.extend({ mode: z.literal('slide') });

export async function POST(req: Request) {
  if (!aiTextEnabled()) return jsonError('KI-Text ist nicht konfiguriert (ANTHROPIC_API_KEY). Nutze "Leer starten".', 503);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    return jsonError(e);
  }
  try {
    const peopleNames = listPeople().map((p) => p.name);
    if ((raw as { mode?: string })?.mode === 'slide') {
      const b = slideBody.parse(raw);
      const carousel = carouselSchema.parse(b.carousel);
      const res = await rewriteSlide(carousel, b.index, { instruction: b.instruction, audience: b.audience, briefing: b.briefing });
      return NextResponse.json(res);
    }
    const b = carouselBody.parse(raw);
    const res = await generateCarousel(b, { photoSrcs: b.photoSrcs, peopleNames });
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof z.ZodError) return jsonError(e);
    if (e instanceof RefusalError) return jsonError(e, 422);
    return jsonError(e, 500);
  }
}
