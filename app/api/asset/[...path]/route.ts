import { readAsset, assetExists } from '@/lib/assets';

export const runtime = 'nodejs';

/** Serves brand logos and people cutouts to the editor UI (read-only, whitelisted folders). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rel = path.join('/');
  if (!/^(brand|people)\/[a-z0-9._-]+\.(png|webp)$/i.test(rel) || !assetExists(rel)) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(new Uint8Array(readAsset(rel)), {
    headers: { 'Content-Type': rel.endsWith('.webp') ? 'image/webp' : 'image/png', 'Cache-Control': 'public, max-age=3600' },
  });
}
