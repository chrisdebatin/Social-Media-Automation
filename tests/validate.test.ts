import { describe, expect, it } from 'vitest';
import { errorsOnly, findFormalAddress, findGenderIssues, findUnbackedNumbers, validateCarousel } from '../lib/validate';
import type { Carousel } from '../lib/schema';
import { slideWith } from './fixtures';

const good: Carousel = {
  slides: [
    { id: 'a', template: 'cover', headline: 'Pflege, die sich nach Zuhause anfühlt', subline: 'Für dich und deine Familie', photo: { src: 'asset:people/mike.png' } },
    { id: 'b', template: 'text', headline: 'Was ist ein Pflegegrad?', body: 'Er zeigt, wie viel Unterstützung jemand braucht. Unsere Berater:innen helfen dir beim Antrag.' },
    { id: 'c', template: 'cta', headline: 'Fragen?', subline: 'Wir sind für dich da.', button: 'Jetzt anrufen' },
  ],
  caption: 'Seit 1997 begleiten wir Kund:innen in NRW und Niedersachsen. 💚',
  hashtags: ['#Pflegeunion', '#Pflege'],
};

describe('du-check', () => {
  it('flags formal address', () => {
    expect(findFormalAddress('Wir beraten Sie gerne')).toEqual(['Sie']);
    expect(findFormalAddress('Ihre Familie ist uns wichtig')).toEqual(['Ihre']);
    expect(findFormalAddress('Wir helfen Ihnen.')).toEqual(['Ihnen']);
  });
  it('allows "du", lowercase sie/ihr and quotes', () => {
    expect(findFormalAddress('Wir beraten dich gerne, ihr seid toll, sie lacht.')).toEqual([]);
    expect(findFormalAddress('Unser Motto: „Kennen Sie schon …?“')).toEqual([]);
    expect(findFormalAddress('Sieben Siegel, Ihringen')).toEqual([]);
  });
  it('is an error for AI output and a warning in manual mode', () => {
    const c = { ...good, slides: [{ ...good.slides[0], subline: 'Für Sie da' }, ...good.slides.slice(1)] };
    expect(errorsOnly(validateCarousel(c, { mode: 'ai' })).some((i) => i.message.includes('Siezen'))).toBe(true);
    const manual = validateCarousel(c, { mode: 'manual' }).filter((i) => i.message.includes('Siezen'));
    expect(manual.every((i) => i.severity === 'warning')).toBe(true);
  });
  it('allows formal address inside the quote template', () => {
    const c: Carousel = { ...good, slides: [good.slides[0], { id: 'q', template: 'quote', quote: 'Ich sage immer: Sie schaffen das!', author: 'Eine Kundin' }, good.slides[2]] };
    expect(validateCarousel(c, { mode: 'ai' }).filter((i) => i.message.includes('Siezen'))).toEqual([]);
  });
});

describe('gendering', () => {
  it('requires the colon', () => {
    expect(findGenderIssues('Pfleger:innen und Kund:innen')).toEqual([]);
    expect(findGenderIssues('Pfleger*innen')).toHaveLength(1);
    expect(findGenderIssues('PflegerInnen')).toHaveLength(1);
    expect(findGenderIssues('Pfleger_innen')).toHaveLength(1);
    expect(findGenderIssues('unsere Kunden')).toHaveLength(1);
    expect(findGenderIssues('Kundenservice und Pflegerin')).toEqual([]);
  });
});

describe('numbers', () => {
  it('only allows numbers from facts or source', () => {
    expect(findUnbackedNumbers('Seit 1997 mit 600 Mitarbeitenden')).toEqual([]);
    expect(findUnbackedNumbers('98 % Zufriedenheit')).toEqual(['98']);
    expect(findUnbackedNumbers('98 % Zufriedenheit', 'Umfrage: 98 % zufrieden')).toEqual([]);
  });
});

describe('carousel rules', () => {
  it('accepts a valid carousel', () => {
    expect(errorsOnly(validateCarousel(good, { mode: 'ai' }))).toEqual([]);
  });
  it('enforces limits and required slots', () => {
    const c = { ...good, slides: [{ ...good.slides[0], headline: 'x'.repeat(61) }, { ...good.slides[1], body: '' }, good.slides[2]] };
    const msgs = errorsOnly(validateCarousel(c, { mode: 'manual' })).map((i) => i.message);
    expect(msgs.some((m) => m.includes('zu lang (61/60'))).toBe(true);
    expect(msgs.some((m) => m.includes('Text fehlt'))).toBe(true);
  });
  it('requires #Pflegeunion, limits emojis and caption length', () => {
    const c = { ...good, hashtags: ['#Pflege'], caption: '😀😀😀😀 ' + 'a'.repeat(2200) };
    const msgs = errorsOnly(validateCarousel(c, { mode: 'manual' })).map((i) => i.message);
    expect(msgs.some((m) => m.includes('#Pflegeunion'))).toBe(true);
    expect(msgs.some((m) => m.includes('3 Emojis'))).toBe(true);
    expect(msgs.some((m) => m.includes('zu lang'))).toBe(true);
  });
  it('rejects emojis on slides', () => {
    const c = { ...good, slides: [{ ...good.slides[0], headline: 'Hallo 👋' }, ...good.slides.slice(1)] };
    expect(errorsOnly(validateCarousel(c, { mode: 'manual' })).some((i) => i.message.includes('Emojis'))).toBe(true);
  });
  it('checks structure in AI mode', () => {
    const c = { ...good, slides: [good.slides[1], good.slides[0]] };
    const msgs = errorsOnly(validateCarousel(c, { mode: 'ai' })).map((i) => i.message);
    expect(msgs.some((m) => m.includes('Slide 1'))).toBe(true);
    expect(msgs.some((m) => m.includes('Letzte Slide'))).toBe(true);
  });
  it('checks bullet count and vertical headline rule', () => {
    const list = { ...slideWith('list', 'min'), bullets: ['a', 'b'] };
    const stmt = { ...slideWith('statement', 'min'), headline: 'Zwei Worte', headlineStyle: 'vertikal' as const };
    const msgs = errorsOnly(validateCarousel({ ...good, slides: [good.slides[0], list, stmt, good.slides[2]] }, { mode: 'manual' })).map((i) => i.message);
    expect(msgs.some((m) => m.includes('3–5 Punkte'))).toBe(true);
    expect(msgs.some((m) => m.includes('Vertikale'))).toBe(true);
  });
});
