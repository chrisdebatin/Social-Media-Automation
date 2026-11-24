import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

import { generateCarousel, htmlToText, rewriteSlide } from '../lib/ai';

const blank = { headline: '', subline: '', body: '', accent: '', quote: '', author: '', button: '', bullets: [], headlineStyle: 'standard', photoIndex: -1, imagePrompt: '' };
const carousel = (sublineCover: string) => ({
  slides: [
    { ...blank, template: 'cover', headline: 'Pflege, die sich nach Zuhause anfühlt', subline: sublineCover, photoIndex: 0 },
    { ...blank, template: 'text', headline: 'Was ist ein Pflegegrad?', body: 'Er zeigt, wie viel Unterstützung jemand braucht. Unsere Berater:innen helfen dir.' },
    { ...blank, template: 'cta', headline: 'Fragen?', subline: 'Wir sind für dich da.', button: 'Jetzt anrufen' },
  ],
  caption: 'Wir sind für dich da – in NRW und Niedersachsen.',
  hashtags: ['#Pflegeunion', '#Pflege'],
});
const toolResponse = (input: unknown, id = 'tu_1') => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name: 'karussell_ausgeben', input }],
});

const input = { briefing: 'Pflegegrad erklären', audience: 'angehoerige' as const, slideCount: 3, photos: [{ kind: 'photo' as const }], allowAiImages: false };

describe('AI self-correction loop', () => {
  beforeEach(() => create.mockReset());

  it('feeds validation errors back as is_error tool_result and accepts the corrected output', async () => {
    create.mockResolvedValueOnce(toolResponse(carousel('Wir beraten Sie gerne'), 'tu_1'));
    create.mockResolvedValueOnce(toolResponse(carousel('Wir beraten dich gerne'), 'tu_2'));
    const res = await generateCarousel(input, { photoSrcs: ['data:image/png;base64,AA=='], peopleNames: [] });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
    expect(res.carousel.slides[0].photo?.src).toBe('data:image/png;base64,AA==');
    const second = create.mock.calls[1][0];
    const last = second.messages.find((m: { role: string; content: unknown }) => m.role === 'user' && Array.isArray(m.content));
    expect(last.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1', is_error: true });
    expect(last.content[0].content).toContain('Siezen');
    expect(second.tool_choice).toEqual({ type: 'auto' });
    expect(second.tools[0].strict).toBe(true);
  });

  it('gives up after 3 attempts and reports the issues', async () => {
    create.mockResolvedValue(toolResponse(carousel('Für Sie und Ihre Familie')));
    const res = await generateCarousel(input, { photoSrcs: ['x'], peopleNames: [] });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(3);
    expect(create).toHaveBeenCalledTimes(3);
    expect(res.issues.some((i) => i.message.includes('Siezen'))).toBe(true);
  });

  it('rejects duplicate photo use and invented numbers', async () => {
    const bad = carousel('Seit 1997 – 98 % zufrieden');
    bad.slides[1] = { ...blank, template: 'photo', headline: 'Gemeinsam', photoIndex: 0 } as never;
    create.mockResolvedValue(toolResponse(bad));
    const res = await generateCarousel(input, { photoSrcs: ['x'], peopleNames: [] });
    const msgs = res.issues.map((i) => i.message).join('\n');
    expect(msgs).toContain('schon auf Slide 1');
    expect(msgs).toContain('98');
  });

  it('throws a clear error on refusal', async () => {
    create.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await expect(generateCarousel(input, { photoSrcs: ['x'], peopleNames: [] })).rejects.toThrow('abgelehnt');
  });

  it('rewrites a single slide keeping template and photo', async () => {
    create.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't', name: 'slide_ausgeben', input: { ...blank, template: 'cover', headline: 'Zuhause gut versorgt', subline: 'Wir begleiten dich' } }],
    });
    const c = { slides: [{ id: 'a', template: 'cover' as const, headline: 'Alt', photo: { src: 'keep' } }], caption: 'x', hashtags: ['#Pflegeunion'] };
    const res = await rewriteSlide(c, 0, {});
    expect(res.slide).toMatchObject({ id: 'a', template: 'cover', headline: 'Zuhause gut versorgt', photo: { src: 'keep' } });
  });
});

describe('article import', () => {
  it('strips HTML and keeps the article text', () => {
    const html = `<html><head><title>Kennen Sie schon … Mike? | Pflegeunion</title><script>x()</script></head>
      <body><nav>Menü</nav><article><h1>Kennen Sie schon Mike?</h1><p>Mike ist Pflegedienstleitung in D&uuml;sseldorf und liebt sein Team. Er ist seit vielen Jahren dabei und kümmert sich um Kund:innen.</p></article><footer>Impressum</footer></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe('Kennen Sie schon … Mike?');
    expect(text).toContain('Düsseldorf');
    expect(text).not.toContain('Menü');
    expect(text).not.toContain('x()');
  });
});
