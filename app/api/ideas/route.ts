import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiTextEnabled, ideasInputSchema, suggestTopics, RefusalError } from '@/lib/ai';
import { listPeople } from '@/lib/assets';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!aiTextEnabled()) return jsonError('KI-Text ist nicht konfiguriert (ANTHROPIC_API_KEY).', 503);
  try {
    const body = ideasInputSchema.parse({ ...(await req.json()), people: listPeople().map((p) => p.name) });
    return NextResponse.json({ ideas: await suggestTopics(body) });
  } catch (e) {
    if (e instanceof z.ZodError) return jsonError(e);
    if (e instanceof RefusalError) return jsonError(e, 422);
    return jsonError(e, 500);
  }
}
