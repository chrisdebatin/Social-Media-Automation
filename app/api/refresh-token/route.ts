import { NextResponse } from 'next/server';
import { refreshToken } from '@/lib/instagram';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Refreshes the long-lived Instagram token (valid 60 days). Env vars cannot be changed at runtime,
 * so the new token is returned once – paste it into IG_ACCESS_TOKEN in Vercel and redeploy.
 */
export async function POST() {
  try {
    const r = await refreshToken();
    return NextResponse.json({ ...r, hint: 'Neuen Token in Vercel als IG_ACCESS_TOKEN speichern und neu deployen.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return jsonError(e, 502);
  }
}
