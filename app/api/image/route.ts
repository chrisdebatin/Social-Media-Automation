import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiImagesEnabled, generateImage } from '@/lib/aiImage';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: Request) {
  if (!aiImagesEnabled()) return jsonError('KI-Bilder sind nicht konfiguriert (OPENAI_API_KEY).', 503);
  try {
    const { prompt } = z.object({ prompt: z.string().min(1).max(1000) }).parse(await req.json());
    return NextResponse.json(await generateImage(prompt));
  } catch (e) {
    return jsonError(e, e instanceof z.ZodError ? 400 : 500);
  }
}
