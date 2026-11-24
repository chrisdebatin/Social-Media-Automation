export interface LibPhoto {
  id: string;
  src: string;
  kind: 'photo' | 'cutout';
  note: string;
  ai?: boolean;
  name?: string;
}

/** UI thumbnail URL for a photo reference. */
export function thumbSrc(src: string): string {
  return src.startsWith('asset:') ? `/api/asset/${src.slice('asset:'.length)}` : src;
}

/**
 * Client-side downscale before upload (Vercel request limit 4.5 MB).
 * PNG keeps transparency (cutouts), everything else becomes JPEG.
 */
export async function downscale(file: File, max = 2000): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const png = file.type === 'image/png';
  let scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 4; attempt++) {
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht verarbeitet werden'))), png ? 'image/png' : 'image/jpeg', 0.88),
    );
    if (blob.size < 3.8 * 1024 * 1024) {
      return new File([blob], file.name.replace(/\.[^.]+$/, png ? '.png' : '.jpg'), { type: blob.type });
    }
    scale *= 0.75;
  }
  throw new Error('Bild ist zu groß.');
}
