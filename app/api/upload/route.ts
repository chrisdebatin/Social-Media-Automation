import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { putFile } from '@/lib/storage';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel request limit is 4.5 MB – the client downscales first
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonError('Keine Datei erhalten.');
    if (!TYPES.includes(file.type)) return jsonError('Nur JPEG, PNG oder WebP.');
    if (file.size > MAX_BYTES) return jsonError('Datei zu groß (max. 4 MB).');
    const input = Buffer.from(await file.arrayBuffer());
    const img = sharp(input).rotate(); // apply EXIF orientation; output drops all metadata (incl. GPS)
    const meta = await img.metadata();
    const alpha = !!meta.hasAlpha && file.type !== 'image/jpeg';
    const out = await img
      .resize({ width: 2160, height: 2160, fit: 'inside', withoutEnlargement: true })
      .toFormat(alpha ? 'png' : 'jpeg', alpha ? {} : { quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const url = await putFile(`photos/upload.${alpha ? 'png' : 'jpg'}`, out.data, alpha ? 'image/png' : 'image/jpeg');
    return NextResponse.json({ url, width: out.info.width, height: out.info.height, cutout: alpha });
  } catch (e) {
    return jsonError(e, 500);
  }
}
