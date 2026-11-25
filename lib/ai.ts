/**
 * AI text generation. The model never designs – it only fills template slots via a tool call.
 * Every output is validated against the CI rules; violations go back to the model as an
 * is_error tool_result for self-correction (max 3 attempts).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlockParam, BetaMessageParam, BetaTool, BetaToolUseBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { audiences, headlineStyles, requiredHashtag, toneGuide, type AudienceId } from './brand';
import { factsAsText } from './facts';
import { CAPTION_MAX, newId, templateCatalog, templateIds, type Carousel, type Slide, type TemplateId } from './schema';
import { PLACEHOLDER, errorsOnly, findFormalAddress, findUnbackedNumbers, formatIssues, validateCarousel, validateSlide, type Issue } from './validate';
import { layoutSlide, overflowingSlots } from './templates';

export const MAX_ATTEMPTS = 3;
export const aiTextEnabled = () => !!process.env.ANTHROPIC_API_KEY;
const model = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

/* ----------------------------------------------------------------- input */

export const photoInfoSchema = z.object({
  kind: z.enum(['photo', 'cutout']),
  note: z.string().optional(),
  /** person name for cutouts from the people library */
  name: z.string().optional(),
});
export type PhotoInfo = z.infer<typeof photoInfoSchema>;

export const generateInputSchema = z.object({
  briefing: z.string().max(8000).default(''),
  articleUrl: z.string().optional(),
  articleText: z.string().max(40000).optional(),
  audience: z.enum(Object.keys(audiences) as [AudienceId, ...AudienceId[]]).default('allgemein'),
  location: z.string().max(80).optional(),
  slideCount: z.number().int().min(2).max(10).default(6),
  photos: z.array(photoInfoSchema).max(20).default([]),
  allowAiImages: z.boolean().default(false),
});
export type GenerateInput = z.infer<typeof generateInputSchema>;

/* ---------------------------------------------------------- tool schemas */

const slideProps = (templates: readonly TemplateId[]) => ({
  template: { type: 'string', enum: [...templates], description: 'Template-ID aus dem Katalog' },
  headline: { type: 'string', description: 'Headline bzw. Name (team). Leer lassen, wenn das Template keine hat.' },
  subline: { type: 'string', description: 'Subline bzw. Rolle (team). Sonst leer.' },
  body: { type: 'string', description: 'Fließtext (nur text). Sonst leer.' },
  accent: { type: 'string', description: 'Akzent in Handschrift (statement, team). Sonst leer.' },
  quote: { type: 'string', description: 'Zitat (nur quote). Sonst leer.' },
  author: { type: 'string', description: 'Autor:in (nur quote). Sonst leer.' },
  button: { type: 'string', description: 'Button-Text (nur cta). Sonst leer.' },
  bullets: { type: 'array', items: { type: 'string' }, description: 'Nur list: 3–5 Punkte. Sonst leeres Array.' },
  headlineStyle: { type: 'string', enum: [...headlineStyles] },
  photoIndex: { type: 'integer', description: 'Index eines hochgeladenen Fotos, oder -1' },
  imagePrompt: { type: 'string', description: 'Englischer Bild-Prompt nur für Foto-Slots ohne photoIndex und nur wenn KI-Bilder erlaubt sind. Sonst leer.' },
});
const SLIDE_KEYS = Object.keys(slideProps(templateIds));

const slideJsonSchema = (templates: readonly TemplateId[]) => ({
  type: 'object',
  properties: slideProps(templates),
  required: SLIDE_KEYS,
  additionalProperties: false,
});

const carouselTool: BetaTool = {
  name: 'karussell_ausgeben',
  description: 'Gibt das fertige Instagram-Karussell (Slides, Caption, Hashtags) aus. Immer genau einmal aufrufen.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      slides: { type: 'array', items: slideJsonSchema(templateIds) },
      caption: { type: 'string', description: `Caption ohne Hashtags, per du, max. 3 Emojis, inkl. Hashtags max. ${CAPTION_MAX} Zeichen` },
      hashtags: { type: 'array', items: { type: 'string' }, description: `5–12 Hashtags, muss ${requiredHashtag} enthalten` },
    },
    required: ['slides', 'caption', 'hashtags'],
    additionalProperties: false,
  } as BetaTool['input_schema'],
};

const slideTool = (template: TemplateId): BetaTool => ({
  name: 'slide_ausgeben',
  description: 'Gibt die neu formulierte Slide aus. Immer genau einmal aufrufen.',
  strict: true,
  input_schema: slideJsonSchema([template]) as BetaTool['input_schema'],
});

const aiSlideSchema = z.object({
  template: z.enum(templateIds),
  headline: z.string(),
  subline: z.string(),
  body: z.string(),
  accent: z.string(),
  quote: z.string(),
  author: z.string(),
  button: z.string(),
  bullets: z.array(z.string()),
  headlineStyle: z.enum(headlineStyles),
  photoIndex: z.number().int(),
  imagePrompt: z.string(),
});
type AiSlide = z.infer<typeof aiSlideSchema>;
const aiCarouselSchema = z.object({ slides: z.array(aiSlideSchema), caption: z.string(), hashtags: z.array(z.string()) });

/* ---------------------------------------------------------------- prompt */

function templateCatalogText(): string {
  return Object.values(templateCatalog)
    .map((t) => {
      const slots = t.slots.map((s) => `${s.key} (${s.label}, max. ${s.max} Zeichen${s.required ? ', Pflicht' : ', optional'})`).join('; ');
      const bullets = t.bullets ? `; bullets: ${t.bullets.min}–${t.bullets.max} Punkte, je max. ${t.bullets.maxChars} Zeichen` : '';
      const photo = t.photo === 'photo' ? ' | braucht ein Foto' : t.photo === 'cutout' ? ' | braucht ein freigestelltes Personen-Foto (cutout)' : '';
      return `- ${t.id}: ${t.description} Felder: ${slots}${bullets}. Headline-Stile: ${t.headlineStyles.join(', ')}${photo}`;
    })
    .join('\n');
}

const SYSTEM = `Du bist Social-Media-Texter:in der Pflegeunion, eines ambulanten Pflegedienstes in NRW und Niedersachsen.
Du schreibst Instagram-Karussells (1080×1350). Du gestaltest NICHT – Layout, Farben, Schriften und Logo kommen aus festen Templates.
Du füllst ausschließlich Text-Slots der Templates über das Tool.

${toneGuide}

ERLAUBTE FAKTEN (nichts anderes erfinden – sonst nur, was im Briefing/Artikel steht):
${factsAsText()}

ZIELGRUPPEN (Personas aus dem Brand Book):
${Object.values(audiences).map((a) => `* ${a.label}: ${a.persona}`).join('\n')}

TEMPLATE-KATALOG:
${templateCatalogText()}

HARTE REGELN
1. Slide 1 ist "cover" oder "photo" (nur wenn weder Fotos noch KI-Bilder verfügbar sind: "statement"). Die letzte Slide ist immer "cta".
2. Nur Felder füllen, die das Template hat; alle anderen Felder leer ("" bzw. []). Zeichenlimits strikt einhalten – lieber deutlich kürzer.
3. Fotos: photoIndex verweist auf ein hochgeladenes Foto. Jedes Foto höchstens einmal. "photo"-Fotos nur für cover/photo, "cutout"-Fotos nur für team. Kein passendes Foto → photoIndex -1.
4. imagePrompt nur für cover/photo-Slides ohne photoIndex und nur, wenn KI-Bilder erlaubt sind; auf Englisch, beschreibt eine authentische Szene (keine Texte, keine Logos, keine echten oder namentlich genannten Personen). Sonst "".
5. "team" nur verwenden, wenn ein cutout-Foto vorhanden ist; Name/Rolle nur aus der Foto-Notiz bzw. dem Briefing übernehmen, nichts erfinden.
6. Slides immer per "du". Gendern mit Doppelpunkt. Keine Emojis auf Slides. Text linksbündig gedacht – keine Zeilenumbrüche erzwingen, außer bei eingerückten Headlines (dort optional ein "\\n" zwischen den zwei Teilen).
7. Caption: per du, kurz, mit Frage oder Handlungsaufforderung, max. 3 Emojis. Hashtags separat, 5–12 Stück, immer ${requiredHashtag}.
8. Keine Heilversprechen, keine erfundenen Zahlen, Preise oder Leistungen, keine erfundenen Testimonials mit vollen Namen.
9. Jede Slide transportiert genau einen Gedanken. Abwechslungsreiche Templates verwenden.

Rufe das Tool genau einmal auf. Wenn das Tool einen Fehler meldet, korrigiere genau die genannten Punkte und rufe es erneut auf.`;

function userPrompt(input: GenerateInput, article?: { title: string; text: string }): string {
  const a = audiences[input.audience];
  const photos = input.photos.length
    ? input.photos.map((p, i) => `  [${i}] ${p.kind === 'cutout' ? 'cutout (freigestellte Person)' : 'Foto'}${p.name ? ` – ${p.name}` : ''}${p.note ? ` – Notiz: ${p.note}` : ''}`).join('\n')
    : '  (keine)';
  return [
    `Erstelle ein Karussell mit genau ${input.slideCount} Slides.`,
    `Zielgruppe: ${a.label}`,
    input.location ? `Standort: ${input.location}` : '',
    `KI-Bilder erlaubt: ${input.allowAiImages ? 'ja' : 'nein'}`,
    `Verfügbare Fotos:\n${photos}`,
    input.briefing.trim() ? `\nBRIEFING:\n${input.briefing.trim()}` : '',
    article ? `\nARTIKEL ZUM UMARBEITEN (Titel: ${article.title}):\n${article.text}\n\nFasse den Artikel als Karussell zusammen. Übernimm Inhalte nur, wenn sie im Artikel stehen. Website-Texte siezen oft – auf Social Media wird geduzt.` : '',
  ].filter(Boolean).join('\n');
}

/* ------------------------------------------------------- AI-only checks */

const GERMAN_HINT = /[äöüß]|\b(und|der|die|das|mit|eine|ein|für)\b/i;

function aiChecks(raw: z.infer<typeof aiCarouselSchema>, input: GenerateInput, peopleNames: string[]): Issue[] {
  const issues: Issue[] = [];
  if (raw.slides.length !== input.slideCount) {
    issues.push({ severity: 'error', message: `Es müssen genau ${input.slideCount} Slides sein (aktuell ${raw.slides.length}).` });
  }
  const used = new Map<number, number>();
  raw.slides.forEach((s, i) => issues.push(...aiSlideChecks(s, i, input, peopleNames, used)));
  return issues;
}

function aiSlideChecks(s: AiSlide, i: number, input: GenerateInput, peopleNames: string[], used: Map<number, number>): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string, field?: string) => issues.push({ severity: 'error', slide: i, field, message });
  const spec = templateCatalog[s.template];
  if (s.photoIndex >= 0) {
    const p = input.photos[s.photoIndex];
    if (!p) err(`photoIndex ${s.photoIndex} existiert nicht.`, 'photoIndex');
    else if (spec.photo === 'none') err(`Template "${s.template}" hat keinen Foto-Slot – photoIndex muss -1 sein.`, 'photoIndex');
    else if (spec.photo === 'cutout' && p.kind !== 'cutout') err('team braucht ein cutout-Foto.', 'photoIndex');
    else if (spec.photo === 'photo' && p.kind !== 'photo') err(`cutout-Fotos nur für team, nicht für "${s.template}".`, 'photoIndex');
    if (used.has(s.photoIndex)) err(`Foto ${s.photoIndex} wird schon auf Slide ${used.get(s.photoIndex)! + 1} verwendet.`, 'photoIndex');
    used.set(s.photoIndex, i);
  } else if (spec.photo === 'cutout') {
    err('team-Slide ohne cutout-Foto – anderes Template wählen.', 'photoIndex');
  } else if (spec.photo === 'photo' && !(input.allowAiImages && s.imagePrompt.trim())) {
    err(input.allowAiImages ? 'Foto fehlt: photoIndex oder imagePrompt angeben.' : 'Foto fehlt und KI-Bilder sind nicht erlaubt – Foto zuweisen oder anderes Template wählen.', 'photoIndex');
  }
  const prompt = s.imagePrompt.trim();
  if (prompt) {
    if (!input.allowAiImages) err('imagePrompt nicht erlaubt (KI-Bilder deaktiviert).', 'imagePrompt');
    else if (spec.photo !== 'photo' || s.photoIndex >= 0) err('imagePrompt nur für cover/photo-Slides ohne photoIndex.', 'imagePrompt');
    if (GERMAN_HINT.test(prompt)) err('imagePrompt muss auf Englisch sein.', 'imagePrompt');
    const named = peopleNames.find((n) => new RegExp(`\\b${n}\\b`, 'i').test(prompt));
    if (named) err(`imagePrompt darf keine echten Mitarbeitenden zeigen ("${named}").`, 'imagePrompt');
  }
  return issues;
}

/* ------------------------------------------------------------ conversion */

function toSlide(s: AiSlide, input: GenerateInput, photoSrcs: (string | null)[], id = newId()): Slide {
  const spec = templateCatalog[s.template];
  const slide: Slide = { id, template: s.template, headlineStyle: spec.headlineStyles.includes(s.headlineStyle) ? s.headlineStyle : spec.defaultHeadlineStyle };
  for (const slot of spec.slots) slide[slot.key] = s[slot.key].trim();
  if (spec.bullets) slide.bullets = s.bullets.map((b) => b.trim()).filter(Boolean);
  if (spec.photo !== 'none') {
    const src = s.photoIndex >= 0 ? photoSrcs[s.photoIndex] : null;
    slide.photo = src ? { src, note: input.photos[s.photoIndex]?.note } : null;
    if (!src && s.imagePrompt.trim() && input.allowAiImages) slide.imagePrompt = s.imagePrompt.trim();
  }
  return slide;
}

const overflowCheck = (s: Slide, index: number, total: number) => overflowingSlots(layoutSlide(s, { index, total }));

/* ------------------------------------------------------------------ loop */

export interface GenerateResult {
  carousel: Carousel;
  issues: Issue[];
  attempts: number;
  ok: boolean;
}

class RefusalError extends Error {}

async function toolLoop<T>(
  system: string,
  tool: BetaTool,
  firstMessage: string,
  check: (input: unknown) => { value: T | null; issues: Issue[] },
): Promise<{ value: T | null; issues: Issue[]; attempts: number }> {
  const messages: BetaMessageParam[] = [{ role: 'user', content: firstMessage }];
  let last: { value: T | null; issues: Issue[] } = { value: null, issues: [{ severity: 'error', message: 'Keine Antwort der KI.' }] };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await anthropic().beta.messages.create({
      model: model(),
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      tool_choice: { type: 'auto' },
      messages,
    });
    if (res.stop_reason === 'refusal') throw new RefusalError('Die KI hat die Anfrage abgelehnt. Bitte Briefing umformulieren.');
    if (res.stop_reason === 'max_tokens') {
      last = { value: null, issues: [{ severity: 'error', message: 'Antwort der KI wurde abgeschnitten.' }] };
      messages.push({ role: 'assistant', content: res.content as BetaContentBlockParam[] });
      messages.push({ role: 'user', content: 'Deine Antwort war zu lang. Bitte kürzer und direkt über das Tool ausgeben.' });
      continue;
    }
    const call = res.content.find((b): b is BetaToolUseBlock => b.type === 'tool_use' && b.name === tool.name);
    messages.push({ role: 'assistant', content: res.content as BetaContentBlockParam[] });
    if (!call) {
      messages.push({ role: 'user', content: `Bitte gib das Ergebnis ausschließlich über das Tool "${tool.name}" aus.` });
      continue;
    }
    last = check(call.input);
    const errors = errorsOnly(last.issues);
    if (last.value && errors.length === 0) return { ...last, attempts: attempt };
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: call.id,
        is_error: true,
        content: `Die Ausgabe verletzt folgende Regeln. Korrigiere sie und rufe "${tool.name}" erneut auf:\n${formatIssues(errors)}`,
      }],
    });
  }
  return { ...last, attempts: MAX_ATTEMPTS };
}

export async function generateCarousel(
  input: GenerateInput,
  ctx: { photoSrcs: (string | null)[]; peopleNames: string[] },
): Promise<GenerateResult> {
  let article: { title: string; text: string } | undefined;
  if (input.articleUrl?.trim()) article = await fetchArticle(input.articleUrl.trim());
  else if (input.articleText?.trim()) article = { title: 'eingefügter Text', text: input.articleText.trim().slice(0, 40000) };

  const sourceText = [input.briefing, input.location, article?.text, ...input.photos.map((p) => p.note ?? '')].join('\n');
  const noPhotos = !input.allowAiImages && !input.photos.some((p) => p.kind === 'photo');

  const result = await toolLoop<Carousel>(SYSTEM, carouselTool, userPrompt(input, article), (raw) => {
    const parsed = aiCarouselSchema.safeParse(raw);
    if (!parsed.success) {
      return { value: null, issues: parsed.error.issues.map((i) => ({ severity: 'error' as const, message: `Schema: ${i.path.join('.')} – ${i.message}` })) };
    }
    const carousel: Carousel = {
      slides: parsed.data.slides.map((s) => toSlide(s, input, ctx.photoSrcs)),
      caption: parsed.data.caption.trim(),
      hashtags: parsed.data.hashtags.map((h) => (h.trim().startsWith('#') ? h.trim() : `#${h.trim()}`)),
    };
    const issues = [
      ...aiChecks(parsed.data, input, ctx.peopleNames),
      ...validateCarousel(carousel, { mode: 'ai', sourceText, overflow: overflowCheck, noPhotos }),
    ];
    return { value: carousel, issues };
  });

  if (!result.value) throw new Error(`KI-Ausgabe unbrauchbar:\n${formatIssues(result.issues)}`);
  return { carousel: result.value, issues: result.issues, attempts: result.attempts, ok: errorsOnly(result.issues).length === 0 };
}

/* ------------------------------------------------------ single slide */

export const rewriteInputSchema = z.object({
  carousel: z.object({ slides: z.array(z.any()), caption: z.string(), hashtags: z.array(z.string()) }),
  index: z.number().int().min(0),
  instruction: z.string().max(500).optional(),
  audience: z.string().optional(),
  briefing: z.string().max(8000).optional(),
});

export async function rewriteSlide(
  carousel: Carousel,
  index: number,
  opts: { instruction?: string; audience?: string; briefing?: string },
): Promise<{ slide: Slide; issues: Issue[]; attempts: number }> {
  const current = carousel.slides[index];
  if (!current) throw new Error('Slide nicht gefunden.');
  const spec = templateCatalog[current.template];
  const context = carousel.slides
    .map((s, i) => `${i + 1}. [${s.template}] ${[s.headline, s.subline, s.body, s.accent, s.quote, s.author, s.button, ...(s.bullets ?? [])].filter(Boolean).join(' | ')}`)
    .join('\n');
  const aud = audiences[opts.audience as AudienceId];
  const msg = [
    `Formuliere Slide ${index + 1} (Template "${spec.id}") neu – gleiches Template, anderer Wortlaut, gleicher Kerngedanke.`,
    opts.instruction ? `Wunsch der Redaktion: ${opts.instruction}` : '',
    aud ? `Zielgruppe: ${aud.label}` : '',
    `Bisheriges Karussell:\n${context}`,
    opts.briefing ? `Briefing:\n${opts.briefing}` : '',
    'photoIndex = -1 und imagePrompt = "" setzen (das Foto bleibt unverändert).',
  ].filter(Boolean).join('\n\n');
  const sourceText = [opts.briefing ?? '', context].join('\n');

  const result = await toolLoop<Slide>(SYSTEM, slideTool(current.template), msg, (raw) => {
    const parsed = aiSlideSchema.safeParse(raw);
    if (!parsed.success) return { value: null, issues: parsed.error.issues.map((i) => ({ severity: 'error' as const, message: `Schema: ${i.path.join('.')} – ${i.message}` })) };
    const slide: Slide = { ...toSlide({ ...parsed.data, template: current.template, photoIndex: -1, imagePrompt: '' }, { photos: [] } as unknown as GenerateInput, [], current.id), photo: current.photo, imagePrompt: current.imagePrompt };
    const issues = validateSlide(slide, index, carousel.slides.length, { mode: 'ai', sourceText, overflow: overflowCheck });
    return { value: slide, issues };
  });
  if (!result.value) throw new Error(`KI-Ausgabe unbrauchbar:\n${formatIssues(result.issues)}`);
  return { slide: result.value, issues: result.issues, attempts: result.attempts };
}

export { RefusalError };

/* ------------------------------------------------------ topic ideas */

export const ideasInputSchema = z.object({
  audience: z.enum(Object.keys(audiences) as [AudienceId, ...AudienceId[]]).optional(),
  location: z.string().max(80).optional(),
  hint: z.string().max(500).optional(),
  count: z.number().int().min(3).max(10).default(6),
  /** team members with cutouts available ("Kennst du schon …") */
  people: z.array(z.string()).max(50).default([]),
});
export type IdeasInput = z.infer<typeof ideasInputSchema>;

export interface TopicIdea {
  title: string;
  audience: AudienceId;
  hook: string;
  briefing: string;
  format: string;
  photoIdea: string;
}

const ideaSchema = z.object({
  title: z.string().min(3).max(80),
  audience: z.enum(Object.keys(audiences) as [AudienceId, ...AudienceId[]]),
  hook: z.string().min(3).max(120),
  briefing: z.string().min(20).max(700),
  format: z.string().max(120),
  photoIdea: z.string().max(300),
});

const ideasTool: BetaTool = {
  name: 'themen_ausgeben',
  description: 'Gibt die Themenvorschläge für Instagram-Karussells aus. Immer genau einmal aufrufen.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Arbeitstitel, max. 80 Zeichen' },
            audience: { type: 'string', enum: Object.keys(audiences) },
            hook: { type: 'string', description: 'Möglicher Hook für Slide 1, per du, max. 60 Zeichen' },
            briefing: { type: 'string', description: 'Briefing für die Karussell-Erstellung (Kerngedanke, 3–6 Inhaltspunkte, Call to Action), max. 700 Zeichen' },
            format: { type: 'string', description: 'Vorgeschlagener Aufbau, z. B. "Cover → 3× Erklärung → Liste → CTA"' },
            photoIdea: { type: 'string', description: 'Welches Foto passt (echtes Teamfoto bevorzugt) – kurz, auf Deutsch' },
          },
          required: ['title', 'audience', 'hook', 'briefing', 'format', 'photoIdea'],
          additionalProperties: false,
        },
      },
    },
    required: ['ideas'],
    additionalProperties: false,
  } as BetaTool['input_schema'],
};

export async function suggestTopics(input: IdeasInput, today = new Date()): Promise<TopicIdea[]> {
  const date = today.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const msg = [
    `Schlage ${input.count} abwechslungsreiche Themen für Instagram-Karussells vor. Heute ist ${date}.`,
    input.audience ? `Zielgruppe: ${audiences[input.audience].label}` : 'Mische die Zielgruppen (Recruiting, Angehörige, Kund:innen, Community).',
    input.location ? `Standort-Bezug: ${input.location}` : '',
    // Portraits need real facts about the person – those come from the team, not from suggestions.
    'Keine Porträts einzelner Mitarbeiter:innen ("Kennst du schon …") – dafür fehlen echte Fakten zur Person.',
    input.hint ? `Wunsch der Redaktion: ${input.hint}` : '',
    'Berücksichtige die Jahreszeit (Wetter, Feiertage, Saison-Themen der Pflege) – aber erfinde keine konkreten Termine, Aktionstage oder Events.',
    'Mische: Ratgeber (Gesundheitskompass), Leistungen erklären, Recruiting/Benefits, Team & Werte, Entlastung für Angehörige, Mutmacher/Statement.',
    'Jede Idee muss allein mit den erlaubten Fakten VOLLSTÄNDIG umsetzbar sein – daraus wird ohne Rückfrage ein fertiger Post erstellt.',
    'Keine Platzhalter wie "[…]" oder "vom Team ergänzen", keine Inhalte, die erst jemand liefern muss. Keine Zahlen außer aus der Faktenliste.',
    'Fotos: Es gibt keine passenden echten Fotos – beschreibe in photoIdea eine Szene, die sich als KI-Bild ohne erkennbare echte Personen umsetzen lässt.',
  ].filter(Boolean).join('\n');

  const res = await toolLoop<TopicIdea[]>(SYSTEM, ideasTool, msg, (raw) => {
    const parsed = z.object({ ideas: z.array(ideaSchema).min(1).max(12) }).safeParse(raw);
    if (!parsed.success) return { value: null, issues: parsed.error.issues.map((i) => ({ severity: 'error' as const, message: `Schema: ${i.path.join('.')} – ${i.message}` })) };
    const issues: Issue[] = [];
    parsed.data.ideas.forEach((idea, k) => {
      const formal = findFormalAddress(`${idea.title} ${idea.hook}`);
      if (formal.length) issues.push({ severity: 'error', message: `Idee ${k + 1}: Siezen ("${formal.join('", "')}") – Social Media immer per du.` });
      if (PLACEHOLDER.test(`${idea.title} ${idea.hook} ${idea.briefing}`))
        issues.push({ severity: 'error', message: `Idee ${k + 1}: enthält Platzhalter – jede Idee muss ohne Ergänzung umsetzbar sein.` });
      const nums = findUnbackedNumbers(`${idea.title} ${idea.hook} ${idea.briefing}`, input.hint ?? '');
      if (nums.length) issues.push({ severity: 'error', message: `Idee ${k + 1}: Zahl(en) ${nums.join(', ')} nicht belegt.` });
    });
    return { value: parsed.data.ideas, issues };
  });
  if (!res.value) throw new Error(`Themenvorschläge unbrauchbar:\n${formatIssues(res.issues)}`);
  return res.value;
}

/* ---------------------------------------------------- article import */

const ALLOWED_HOST = /(^|\.)pflegeunion\.de$/i;

export async function fetchArticle(url: string): Promise<{ title: string; text: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Ungültige URL.');
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOST.test(u.hostname)) {
    throw new Error('Nur Artikel von https://pflegeunion.de können importiert werden. Andere Texte bitte einfügen.');
  }
  const res = await fetch(u, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'PflegeunionSocialStudio/1.0' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Artikel konnte nicht geladen werden (${res.status}).`);
  if (!ALLOWED_HOST.test(new URL(res.url).hostname)) throw new Error('Weiterleitung auf fremde Domain blockiert.');
  const html = (await res.text()).slice(0, 2_000_000);
  return htmlToText(html);
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s*[|–-]\s*Pflegeunion.*$/i, '').trim();
  let body = /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
  body = body
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|div|section|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1)
    .join('\n')
    .slice(0, 20000);
  if (text.length < 80) throw new Error('Im Artikel wurde kaum Text gefunden – bitte den Text direkt einfügen.');
  return { title, text };
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n] ?? m);
}
