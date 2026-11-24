import { NextResponse } from 'next/server';
import { deleteDraft, loadDraft } from '@/lib/storage';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadDraft(id).catch(() => null);
  return d ? NextResponse.json(d) : jsonError('Entwurf nicht gefunden.', 404);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteDraft(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 500);
  }
}
