/**
 * Optional AI images (OpenAI gpt-image-1, 1024×1536). Env-gated by OPENAI_API_KEY.
 * Slides with AI images are flagged (photo.ai = true) → published with Instagram's AI label.
 */
import OpenAI from 'openai';
import { putFile } from './storage';
import { listPeople } from './assets';

export const aiImagesEnabled = () => !!process.env.OPENAI_API_KEY && process.env.AI_IMAGES !== 'off';

const STYLE = [
  'Authentic documentary photograph, German home care (ambulante Pflege) setting.',
  'Natural daylight, warm and optimistic mood, real everyday moment, candid, not staged.',
  'Dignified, respectful depiction of older people; caregivers wear green scrubs.',
  'Fictional people only. No text, no letters, no logos, no watermarks, no brand names.',
  'Portrait 4:5 composition with generous margins so it can be cropped; main subject slightly right of centre.',
].join(' ');

/** Never generate images of real, named employees. */
export function checkImagePrompt(prompt: string): string | null {
  const p = prompt.trim();
  if (p.length < 10) return 'Bild-Beschreibung ist zu kurz.';
  if (p.length > 1000) return 'Bild-Beschreibung ist zu lang (max. 1000 Zeichen).';
  const names = listPeople().map((x) => x.name).filter((n) => n.length > 2);
  const hit = names.find((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(p));
  if (hit) return `KI-Bilder dürfen keine echten Mitarbeitenden zeigen („${hit}“).`;
  if (/\b(logo|pflegeunion|schriftzug|text overlay)\b/i.test(p)) return 'Keine Logos oder Texte im KI-Bild – das Layout fügt sie hinzu.';
  return null;
}

export async function generateImage(prompt: string): Promise<{ url: string; ai: true }> {
  if (!aiImagesEnabled()) throw new Error('KI-Bilder sind nicht konfiguriert (OPENAI_API_KEY).');
  const problem = checkImagePrompt(prompt);
  if (problem) throw new Error(problem);
  const client = new OpenAI();
  const res = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    prompt: `${STYLE}\n\nScene: ${prompt.trim()}`,
    size: '1024x1536',
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('Kein Bild erhalten.');
  const url = await putFile(`photos/ai-${Date.now()}.png`, Buffer.from(b64, 'base64'), 'image/png');
  return { url, ai: true };
}
