import { templateCatalog, type Slide, type TemplateId, templateIds } from '../lib/schema';

/** Realistic German filler with umlauts, ß and gendered words, cut to exactly `n` characters at a word boundary-ish. */
const WORDS = (
  'Pfleger:innen Kund:innen Gesundheitskompass Wohngemeinschaft Intensivpflege Alltagshilfe Größe Grüße ' +
  'Fußpflege Übergänge Äpfel Ölmühle Betreuungsangebote Pflegefachkräfte Zuverlässigkeit gemeinsam sicher ' +
  'versorgt Mitarbeiter:innen Wertschätzung Nachbarschaft Lebensfreude Mittagspause Beratungsgespräch'
).split(' ');

export function germanText(n: number, seed = 0): string {
  let out = '';
  let i = seed;
  while ([...out].length < n) {
    out += (out ? ' ' : '') + WORDS[i % WORDS.length];
    i += 3;
  }
  const chars = [...out].slice(0, n);
  // don't end in a space
  while (chars[chars.length - 1] === ' ') chars[chars.length - 1] = 'ß';
  return chars.join('');
}

export function slideWith(template: TemplateId, length: 'min' | 'max', seed = 0): Slide {
  const spec = templateCatalog[template];
  const s: Slide = { id: `${template}-${length}`, template, headlineStyle: spec.defaultHeadlineStyle };
  for (const slot of spec.slots) {
    if (length === 'min') s[slot.key] = slot.required ? (slot.key === 'headline' ? 'Hallo' : 'Ja') : '';
    else s[slot.key] = germanText(slot.max, seed + slot.max);
  }
  if (spec.bullets) {
    const count = length === 'min' ? spec.bullets.min : spec.bullets.max;
    s.bullets = Array.from({ length: count }, (_, k) => (length === 'min' ? 'Ja' : germanText(spec.bullets!.maxChars, seed + k * 5)));
  }
  if (spec.photo === 'cutout') s.photo = { src: 'asset:people/mike.png' };
  return s;
}

export const allTemplates = templateIds;
