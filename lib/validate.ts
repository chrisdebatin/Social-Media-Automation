/**
 * CI rule checks for a carousel. Used
 *  - in the AI loop (mode "ai": violations are errors and are sent back to the model), and
 *  - in the editor (mode "manual": tone rules become warnings; hard limits stay errors).
 */
import { requiredHashtag } from './brand';
import { allowedNumbers } from './facts';
import {
  CAPTION_MAX, HASHTAG_MAX, charCount, fullCaption, templateCatalog, type Carousel, type Slide, type TextSlot,
} from './schema';

export interface Issue {
  severity: 'error' | 'warning';
  slide?: number; // 0-based
  field?: string;
  message: string;
}

export interface ValidateOptions {
  mode: 'ai' | 'manual';
  /** briefing + article text: numbers that appear here may be used */
  sourceText?: string;
  /** optional: overflow detection (server only – needs fonts) */
  overflow?: (slide: Slide, index: number, total: number) => string[];
}

/* ------------------------------------------------------------- text rules */

/** Remove quoted passages – formal address inside a literal quote is allowed. */
export function stripQuoted(text: string): string {
  return text
    .replace(/„[^“”"]*[“”"]/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/»[^«]*«/g, ' ')
    .replace(/‚[^‘’']*[‘’']/g, ' ');
}

const FORMAL = /(?<![\p{L}])(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)(?![\p{L}])/gu;

/** Formal address ("Sie/Ihnen/Ihr…") outside quotes. Social Media is always "du". */
export function findFormalAddress(text: string): string[] {
  const t = stripQuoted(text);
  return [...t.matchAll(FORMAL)].map((m) => m[1]);
}

const WRONG_GENDER = /\p{L}+(?:(?:\*|_|\/-?)innen|Innen)\b/gu;
const GENERIC_MASC = /(?<![\p{L}])(Pfleger|Mitarbeiter|Mitarbeitern|Kollegen|Kunden|Patienten|Ärzte|Ärzten|Bewerber|Teilnehmer|Experten|Berater|Betreuer|Nutzer)(?![\p{L}:*_/])/gu;

export function findGenderIssues(text: string): string[] {
  const issues: string[] = [];
  for (const m of text.matchAll(WRONG_GENDER)) issues.push(`"${m[0]}" → bitte mit Doppelpunkt gendern (z. B. Kund:innen)`);
  for (const m of stripQuoted(text).matchAll(GENERIC_MASC)) issues.push(`"${m[1]}" → bitte gendern (z. B. ${genderSuggestion(m[1])})`);
  return issues;
}

function genderSuggestion(w: string): string {
  const map: Record<string, string> = {
    Kunden: 'Kund:innen', Patienten: 'Patient:innen', Kollegen: 'Kolleg:innen', Ärzte: 'Ärzt:innen', Ärzten: 'Ärzt:innen',
    Mitarbeitern: 'Mitarbeiter:innen', Experten: 'Expert:innen',
  };
  return map[w] ?? `${w}:innen`;
}

const EMOJI = /\p{Extended_Pictographic}/gu;
export const countEmojis = (t: string) => [...t.matchAll(EMOJI)].length;

/** Numbers in the text that are neither in the facts nor in the source material. */
export function findUnbackedNumbers(text: string, sourceText = ''): string[] {
  const src = new Set([...sourceText.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => normNum(m[0])));
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)]
    .map((m) => normNum(m[0]))
    .filter((n) => !allowedNumbers.has(n) && !src.has(n) && !/^(1|2|3|4|5|6|7|8|9|10)$/.test(n));
}
const normNum = (n: string) => n.replace(/\./g, '').replace(',', '.');

const SLIDE_TEXT_FIELDS: TextSlot[] = ['headline', 'subline', 'body', 'accent', 'quote', 'author', 'button'];

function slideTexts(s: Slide): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  for (const f of SLIDE_TEXT_FIELDS) if (s[f]) out.push({ field: f, text: s[f]! });
  (s.bullets ?? []).forEach((b, i) => b && out.push({ field: `bullets.${i}`, text: b }));
  return out;
}

/* ----------------------------------------------------------------- slide */

export function validateSlide(s: Slide, i: number, total: number, o: ValidateOptions): Issue[] {
  const issues: Issue[] = [];
  const spec = templateCatalog[s.template];
  const tone: Issue['severity'] = o.mode === 'ai' ? 'error' : 'warning';
  const push = (severity: Issue['severity'], message: string, field?: string) =>
    issues.push({ severity, slide: i, field, message });

  for (const slot of spec.slots) {
    const v = s[slot.key]?.trim() ?? '';
    if (slot.required && !v) push('error', `${slot.label} fehlt.`, slot.key);
    if (charCount(v) > slot.max) push('error', `${slot.label} ist zu lang (${charCount(v)}/${slot.max} Zeichen).`, slot.key);
  }
  // fields the template does not have must stay empty (the AI must not invent slots)
  for (const f of SLIDE_TEXT_FIELDS) {
    if (s[f]?.trim() && !spec.slots.some((x) => x.key === f)) {
      push(o.mode === 'ai' ? 'error' : 'warning', `Feld "${f}" gibt es im Template "${spec.id}" nicht.`, f);
    }
  }
  if (spec.bullets) {
    const b = (s.bullets ?? []).map((x) => x.trim()).filter(Boolean);
    if (b.length < spec.bullets.min || b.length > spec.bullets.max) {
      push('error', `Liste braucht ${spec.bullets.min}–${spec.bullets.max} Punkte (aktuell ${b.length}).`, 'bullets');
    }
    b.forEach((x, k) => {
      if (charCount(x) > spec.bullets!.maxChars) push('error', `Punkt ${k + 1} ist zu lang (${charCount(x)}/${spec.bullets!.maxChars}).`, `bullets.${k}`);
    });
  } else if (s.bullets?.some((x) => x.trim())) {
    push(o.mode === 'ai' ? 'error' : 'warning', `Template "${spec.id}" hat keine Aufzählung.`, 'bullets');
  }

  const style = s.headlineStyle ?? spec.defaultHeadlineStyle;
  if (!spec.headlineStyles.includes(style)) push('error', `Headline-Stil "${style}" ist für "${spec.label}" nicht erlaubt.`, 'headlineStyle');
  if (style === 'vertikal' && (/\s/.test(s.headline?.trim() ?? '') || charCount(s.headline) > 14)) {
    push('error', 'Vertikale Headlines nur mit einem kurzen Wort (max. 14 Zeichen).', 'headline');
  }

  for (const { field, text } of slideTexts(s)) {
    const quoteField = s.template === 'quote' && field === 'quote';
    if (!quoteField) {
      const formal = findFormalAddress(text);
      if (formal.length) push(tone, `Siezen gefunden ("${formal.join('", "')}") – auf Social Media immer "du".`, field);
    }
    for (const g of findGenderIssues(text)) push(tone, g, field);
    if (countEmojis(text)) push('error', 'Keine Emojis auf Slides.', field);
    if (o.mode === 'ai') {
      const nums = findUnbackedNumbers(text, o.sourceText);
      if (nums.length) push('error', `Zahl(en) ${nums.join(', ')} sind nicht durch Fakten/Briefing belegt.`, field);
    }
  }

  if (o.overflow) {
    for (const slot of o.overflow(s, i, total)) {
      push('error', `Text in "${slot}" passt nicht ins Layout – bitte kürzen.`, slot);
    }
  }
  return issues;
}

/* -------------------------------------------------------------- carousel */

export function validateCarousel(c: Carousel, o: ValidateOptions): Issue[] {
  const issues: Issue[] = [];
  const n = c.slides.length;
  const structure: Issue['severity'] = o.mode === 'ai' ? 'error' : 'warning';
  if (n < 1 || n > 10) issues.push({ severity: 'error', message: `Ein Karussell hat 1–10 Slides (aktuell ${n}).` });
  if (n > 1) {
    if (!['cover', 'photo'].includes(c.slides[0].template)) issues.push({ severity: structure, slide: 0, message: 'Slide 1 sollte "cover" oder "photo" sein.' });
    if (c.slides[n - 1].template !== 'cta') issues.push({ severity: structure, slide: n - 1, message: 'Letzte Slide sollte "cta" sein.' });
  }
  c.slides.forEach((s, i) => issues.push(...validateSlide(s, i, n, o)));

  // caption + hashtags
  const tone: Issue['severity'] = o.mode === 'ai' ? 'error' : 'warning';
  const caption = c.caption ?? '';
  if (!caption.trim()) issues.push({ severity: 'error', field: 'caption', message: 'Caption fehlt.' });
  const full = fullCaption(c);
  if (charCount(full) > CAPTION_MAX) issues.push({ severity: 'error', field: 'caption', message: `Caption inkl. Hashtags zu lang (${charCount(full)}/${CAPTION_MAX}).` });
  if (countEmojis(caption) > 3) issues.push({ severity: 'error', field: 'caption', message: `Maximal 3 Emojis in der Caption (aktuell ${countEmojis(caption)}).` });
  const formal = findFormalAddress(caption);
  if (formal.length) issues.push({ severity: tone, field: 'caption', message: `Siezen in der Caption ("${formal.join('", "')}") – auf Social Media immer "du".` });
  for (const g of findGenderIssues(caption)) issues.push({ severity: tone, field: 'caption', message: g });
  if (o.mode === 'ai') {
    const nums = findUnbackedNumbers(caption, o.sourceText);
    if (nums.length) issues.push({ severity: 'error', field: 'caption', message: `Zahl(en) ${nums.join(', ')} in der Caption sind nicht belegt.` });
  }

  const tags = c.hashtags.map((h) => h.trim()).filter(Boolean);
  if (!tags.some((t) => t.toLowerCase() === requiredHashtag.toLowerCase())) {
    issues.push({ severity: 'error', field: 'hashtags', message: `Hashtags müssen ${requiredHashtag} enthalten.` });
  }
  if (tags.length > HASHTAG_MAX) issues.push({ severity: 'error', field: 'hashtags', message: `Maximal ${HASHTAG_MAX} Hashtags.` });
  for (const t of tags) {
    if (!/^#[\p{L}\p{N}_]+$/u.test(t)) issues.push({ severity: 'error', field: 'hashtags', message: `Ungültiger Hashtag "${t}" (nur Buchstaben/Ziffern, beginnt mit #).` });
  }
  return issues;
}

export const errorsOnly = (issues: Issue[]) => issues.filter((i) => i.severity === 'error');

export function formatIssues(issues: Issue[]): string {
  return issues
    .map((i) => `- ${i.slide !== undefined ? `Slide ${i.slide + 1}` : 'Karussell'}${i.field ? ` [${i.field}]` : ''}: ${i.message}`)
    .join('\n');
}
