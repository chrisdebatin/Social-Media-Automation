import { NextResponse } from 'next/server';
import { listSubmissions } from '@/lib/storage';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ submissions: await listSubmissions() });
  } catch (e) {
    return jsonError(e, 500);
  }
}
