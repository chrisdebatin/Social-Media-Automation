import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { newId, submissionSchema } from '@/lib/schema';
import { putFile, saveSubmission } from '@/lib/storage';
import { checkSubmitKey } from '@/lib/submitKey';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Public endpoint for the employee submission link – protected by SUBMIT_KEY, not by basic auth. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    if (!checkSubmitKey(String(form.get('k') ?? ''))) return jsonError('Dieser Link ist nicht (mehr) gültig.', 403);
    if (form.get('consent') !== 'true') return jsonError('Bitte die Einwilligung bestätigen.');
    const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length < 1 || files.length > 3) return jsonError('Bitte 1 bis 3 Fotos auswählen.');
    if (files.some((f) => !TYPES.includes(f.type) || f.size > 1.5 * 1024 * 1024)) return jsonError('Nur JPEG/PNG/WebP bis 1,5 MB.');

    const id = newId() + newId();
    const photos = [];
    for (const [i, f] of files.entries()) {
      // re-encode: drops EXIF/GPS metadata
      const out = await sharp(Buffer.from(await f.arrayBuffer())).rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      const src = await putFile(`submissions/photos/${id}-${i + 1}.jpg`, out.data, 'image/jpeg');
      photos.push({ src, width: out.info.width, height: out.info.height });
    }
    const str = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max) || undefined;
    const sub = submissionSchema.parse({
      id,
      createdAt: new Date().toISOString(),
      name: str('name', 60),
      location: str('location', 80),
      text: str('text', 600) ?? '',
      photos,
      consent: true,
      status: 'neu',
    });
    await saveSubmission(sub);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 500);
  }
}
