import { NextResponse } from 'next/server';
import { draftSchema } from '@/lib/schema';
import { draftsEnabled, listDrafts, saveDraft } from '@/lib/storage';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!draftsEnabled()) return NextResponse.json({ drafts: [], enabled: false });
  try {
    return NextResponse.json({ drafts: await listDrafts(), enabled: true });
  } catch (e) {
    return jsonError(e, 500);
  }
}

export async function POST(req: Request) {
  try {
    const draft = draftSchema.parse({ ...(await req.json()), updatedAt: new Date().toISOString() });
    // data URLs would make drafts huge – they only exist without Blob (local mode)
    await saveDraft(draft);
    return NextResponse.json({ ok: true, id: draft.id, updatedAt: draft.updatedAt });
  } catch (e) {
    return jsonError(e, 400);
  }
}
