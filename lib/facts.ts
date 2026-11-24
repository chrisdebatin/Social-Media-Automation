/**
 * Company facts the AI is allowed to use. Edit freely – the AI must not invent anything beyond this
 * list, the user's briefing or the repurposed article.
 */
export const facts = {
  gruendung: 1997,
  mitarbeitende: '600+',
  qualifikation: 'hoher Anteil examinierter Pflegefachkräfte',
  regionen: ['Nordrhein-Westfalen', 'Niedersachsen'],
  standorte: {
    NRW: [
      'Alverdissen', 'Attendorn', 'Bad Oeynhausen', 'Beverungen', 'Dorsten', 'Düsseldorf', 'Duisburg',
      'Erkrath', 'Gevelsberg', 'Hilden', 'Iserlohn', 'Kerpen', 'Mettmann', 'Neuenrade', 'Plettenberg',
      'Schieder-Schwalenberg', 'Sprockhövel', 'Velbert', 'Wuppertal',
    ],
    Niedersachsen: ['Bad Nenndorf', 'Bad Pyrmont', 'Emmerthal', 'Hameln', 'Hessisch-Oldendorf', 'Rinteln'],
  },
  leistungen: [
    'Häusliche Pflege', 'Alltagshilfe', 'Intensivpflege', 'Palliativpflege', 'Tagespflege',
    'Betreutes Wohnen', 'Wohngemeinschaft', '24-Stunden-Betreuung', 'Beratung & Schulung', 'Fahrdienst',
    'Pflegehilfsmittel', 'Sozialdienst', 'Speziell für Kinder',
  ],
  contentSerien: ['"Kennen Sie schon …" (Team-Porträts)', 'Gesundheitskompass', 'Neuigkeiten'],
  karriere: ['Offene Stellen', 'Benefits', 'Care for Integration'],
  website: 'pflegeunion.de',
  claim: 'Gemeinsam. Sicher. Versorgt.',
} as const;

export const allLocations = [...facts.standorte.NRW, ...facts.standorte.Niedersachsen];

export function factsAsText(): string {
  return [
    `- Gegründet ${facts.gruendung}, ${facts.mitarbeitende} Mitarbeitende, ${facts.qualifikation}.`,
    `- Ambulanter Pflegedienst in ${facts.regionen.join(' und ')}.`,
    `- Standorte NRW: ${facts.standorte.NRW.join(', ')}.`,
    `- Standorte Niedersachsen: ${facts.standorte.Niedersachsen.join(', ')}.`,
    `- Leistungen: ${facts.leistungen.join(', ')}.`,
    `- Content-Serien auf der Website: ${facts.contentSerien.join(', ')}.`,
    `- Karriere: ${facts.karriere.join(', ')}.`,
    `- Website: ${facts.website}. Claim: "${facts.claim}"`,
  ].join('\n');
}

/** Numbers that may appear in generated text without being in the briefing. */
export const allowedNumbers = new Set(['1997', '600', '24', String(allLocations.length)]);
