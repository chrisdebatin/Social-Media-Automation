import { z } from 'zod';
import { renderSlide, toJpeg } from '@/lib/render';
import { slideSchema } from '@/lib/schema';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  slide: slideSchema,
  index: z.number().int().min(0).max(9),
  total: z.number().int().min(1).max(10),
  /** preview: small JPEG for the editor; otherwise full-size PNG */
  preview: z.boolean().optional(),
  format: z.enum(['png', 'jpeg']).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return jsonError(e);
  }
  try {
    const { png, overflow } = await renderSlide(body.slide, { index: body.index, total: body.total });
    const asJpeg = body.preview || body.format === 'jpeg';
    const out = asJpeg ? await toJpeg(png, body.preview ? { width: 540, quality: 82 } : {}) : png;
    return new Response(new Uint8Array(out), {
      headers: {
        'Content-Type': asJpeg ? 'image/jpeg' : 'image/png',
        'Cache-Control': 'no-store',
        'X-Overflow': overflow.join(','),
      },
    });
  } catch (e) {
    return jsonError(e, 500);
  }
}
