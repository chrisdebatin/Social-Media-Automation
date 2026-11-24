import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteSubmission, loadSubmission, saveSubmission } from '@/lib/storage';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { status } = z.object({ status: z.enum(['neu', 'in_arbeit', 'erledigt']) }).parse(await req.json());
    const sub = await loadSubmission(id);
    if (!sub) return jsonError('Nicht gefunden.', 404);
    await saveSubmission({ ...sub, status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteSubmission(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 500);
  }
}
