/**
 * Renders a sample carousel to ./out/ for visual CI review.
 *   npm run render:test -- [path/to/test-photo.jpg]
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderSlide } from '../lib/render';
import type { Slide } from '../lib/schema';
void React;

const photoPath = process.argv[2];
const photo = photoPath
  ? { src: `data:image/jpeg;base64,${fs.readFileSync(photoPath).toString('base64')}` }
  : null;

export const sampleSlides: Slide[] = [
  { id: 's1', template: 'cover', headline: 'Pflege, die sich nach Zuhause anfühlt', subline: 'Wie wir Kund:innen im Alltag begleiten', photo },
  { id: 's2', template: 'photo', headline: 'Gemeinsam statt allein', subline: 'Unsere Pfleger:innen sind für dich da.', photo },
  { id: 's3', template: 'text', headline: 'Was ist eigentlich ein Pflegegrad?', body: 'Der Pflegegrad zeigt, wie viel Unterstützung jemand im Alltag braucht. Er entscheidet darüber, welche Leistungen die Pflegekasse übernimmt. Unsere Berater:innen helfen dir gerne beim Antrag – Schritt für Schritt.' },
  { id: 's4', template: 'statement', headline: 'Mit uns geht es immer bergauf!', accent: 'versprochen.', headlineStyle: 'eingerueckt' },
  { id: 's5', template: 'statement', headline: 'Neugier', accent: 'ist bei uns ein Markenwert – frag uns ruhig alles!', headlineStyle: 'vertikal' },
  { id: 's6', template: 'quote', quote: 'Hier wird Wertschätzung nicht nur gesagt, sondern jeden Tag gelebt.', author: 'Pflegefachkraft aus Hameln' },
  { id: 's7', template: 'team', headline: 'Mike', subline: 'Pflegedienstleitung in Düsseldorf', accent: 'Mag Teamfrühstück, Fußball und gute Laune am Morgen.', photo: { src: 'asset:people/mike.png' } },
  { id: 's8', template: 'list', headline: 'Darum Pflegeunion', bullets: ['Ein Team, das füreinander da ist', 'Moderne Dienstwagen', 'Echte Wertschätzung', 'Weiterbildung, die dich weiterbringt'] },
  { id: 's9', template: 'cta', headline: 'Lust, Teil des Teams zu werden?', subline: 'Alle offenen Stellen findest du auf unserer Website.', button: 'Jetzt bewerben' },
];

(async () => {
  const out = path.join(process.cwd(), 'out');
  fs.mkdirSync(out, { recursive: true });
  for (let i = 0; i < sampleSlides.length; i++) {
    const t = Date.now();
    const { png, overflow } = await renderSlide(sampleSlides[i], { index: i, total: sampleSlides.length });
    const file = path.join(out, `${String(i + 1).padStart(2, '0')}-${sampleSlides[i].template}.png`);
    fs.writeFileSync(file, png);
    console.log(file, `${Date.now() - t}ms`, overflow.length ? `OVERFLOW: ${overflow.join(',')}` : 'ok');
  }
})();
