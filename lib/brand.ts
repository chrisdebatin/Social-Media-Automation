/**
 * Single source of truth for every CI value (Brand Book Pflegeunion, Rheinideen GmbH).
 * Never hard-code colours, fonts, sizes or logo rules anywhere else.
 */

export const canvas = { width: 1080, height: 1350 } as const; // Instagram 4:5

/* ------------------------------------------------------------------ Farben */
// TODO(marketing): The supplied logo PNGs use #afca0b / #00633a (print conversion).
// The tokens below are the web hex values from the Brand Book p.30–31. Please confirm.
export const colors = {
  // Primärfarben – "nicht variabel"
  apfelgruen: '#b4d214', // Optimismus, ~35 %
  waldgruen: '#006937', // Professionalität & Vertrauen, ~15 %
  weiss: '#ffffff', // ~50 %
  // Sekundärfarben – Grautöne, v. a. für Wellen und Kleckse
  grau15: '#ececec',
  grau25: '#d9d9d9',
  grau40: '#b2b2b2',
  grau60: '#878787',
  // Schwarz nur für Text
  schwarz: '#1d1d1b',
  // Akzente – bewusst und selten einsetzen
  rot: '#d94e37',
  petrol: '#3995a2',
  gelb: '#e6cd00',
} as const;

export type BrandColor = keyof typeof colors;

/** Target colour shares (used for documentation / design review, not enforced per pixel). */
export const colorShares = { weiss: 0.5, apfelgruen: 0.35, waldgruen: 0.15 } as const;

/* -------------------------------------------------------------- Typografie */
export const fonts = {
  sans: 'Nunito Sans', // Hausschrift (OFL)
  accent: 'Akzent', // Nifty Script if licensed file present, else Caveat
} as const;

export const weights = { headline: 800, subline: 700, copy: 400 } as const;

/** Copy size on a 1080 px social canvas. Everything else is derived from it. */
const COPY = 36;
export const type = {
  copy: { size: COPY, lineHeight: 1.2 }, // Brand Book: 11/13.2
  // Subline = copy + 2–4 pt (scaled: +18 … +36 %)
  subline: { size: Math.round(COPY * 1.25), min: Math.round(COPY * 1.18), lineHeight: 1.2 },
  // Headline = 2–4× copy, line-height ≈ 1.1
  headline: { min: COPY * 2, max: COPY * 4, lineHeight: 1.1 },
  accent: { size: 64, min: 44, lineHeight: 1.15 },
  /** Fonts must never get manual letter-spacing. */
  letterSpacing: 0,
} as const;

/** Allowed headline variants (Brand Book p.36). Text is always left-aligned. */
export const headlineStyles = ['standard', 'eingerueckt', 'vertikal'] as const;
export type HeadlineStyle = (typeof headlineStyles)[number];

/* -------------------------------------------------------------------- Logo */
export const logo = {
  files: {
    hauptversion: 'brand/logo-hauptversion.png', // auf Weiß
    alternative: 'brand/logo-alternative.png', // auf Apfelgrün / Waldgrün / Grau
    kreisHaupt: 'brand/kreislogo-hauptversion.png', // Waldgrüner Außenring
    kreisAlt: 'brand/kreislogo-alternative.png', // Apfelgrüner Außenring
  },
  /** width / height of the (trimmed) wordmark PNGs */
  aspect: 1600 / 367,
  /** Height of the "N" in PFLEGEUNION relative to logo width (measured from the PNG). */
  nHeightRatio: 0.07,
  /** Width used on social slides. */
  width: 440,
  /** Below this width only the round mark may be used (Mindestbreite). */
  minWidth: 260,
  claim: 'Gemeinsam. Sicher. Versorgt.',
} as const;

export const logoX = logo.width * logo.nHeightRatio; // Schutzzone X (≈ 31 px)
export const logoHeight = logo.width / logo.aspect;
/** Distance to the edge: between 1 X and 2 X – we use 2 X. */
export const logoEdge = Math.round(2 * logoX);
export const roundMarkSize = 132;

/** Page margin for all text. Equal to the logo edge distance so everything shares one left axis. */
export const pad = logoEdge;

/* --------------------------------------------------------- Tone of voice */
export const toneGuide = `
MARKE
- Markenversprechen: "Gemeinsam. Sicher. Versorgt."
- Vision: Jeder Mensch kann, unabhängig von körperlichen Einschränkungen, ein glückliches Leben führen.
- Markenwerte: Neugier, Vertrauen, Freundschaft, Humor, Optimismus.

TONALITÄT
- Ehrlich und direkt – Vertrauen durch Transparenz.
- Schwierige Themen taktvoll und mit Verständnis ansprechen.
- Klar und verständlich, aber nie aufdringlich. Gerne eine Prise Humor.
- Nur positive, optimistische Formulierungen ("Mit uns geht es immer bergauf!"). Keine Angstmache.
- Mit Fragen Neugier wecken und die Zielgruppe ehrlich einbeziehen.
- Inklusiv: Gendern immer mit Doppelpunkt (Pfleger:innen, Kund:innen, Mitarbeiter:innen).

ANSPRACHE
- Social Media ist IMMER per "du" (Brand-Book-Regel) – auch gegenüber Angehörigen und Kund:innen.
  Niemals "Sie", "Ihnen", "Ihr/Ihre" als Anrede verwenden (außer innerhalb eines wörtlichen Zitats).

VERBOTE
- Keine Emojis auf den Slides; maximal 3 Emojis in der Caption.
- Keine Heilversprechen, keine erfundenen Zahlen oder Leistungen, keine erfundenen Testimonials mit
  realistisch klingenden vollen Namen. Nur Fakten aus der Faktenliste oder dem Briefing/Artikel verwenden.
`.trim();

/* ------------------------------------------------------------- Personas */
export const audiences = {
  pflegekraefte: {
    label: 'Pflegekräfte (Recruiting)',
    persona: `Mira, 28, examinierte Pflegefachkraft mit 7 Jahren Erfahrung. Liebt ihren Beruf, aber nicht die Rahmenbedingungen.
Wünscht sich echte Wertschätzung (nicht nur mündlich), ein Team, das füreinander sorgt, einen modernen Arbeitgeber.
Weg von: dem 0-8-15-Pflegedienst, bei dem alles ist wie beim alten Arbeitgeber.
Hin zu: einem modernen Arbeitgeber, der Pflege in eine zukunftssichere Karrierechance verwandelt.`,
  },
  angehoerige: {
    label: 'Angehörige',
    persona: `Cornelia, 51, Zahnmedizinische Fachassistentin und Yogalehrerin. Ihr Vater braucht nach einem Unfall Pflege.
Sie ist besorgt: Wird er glücklich? Was, wenn Tabletten falsch gestellt werden?
Weg von: dem Zwang, jeden Schritt der Versorgung selbst kontrollieren zu müssen.
Hin zu: einem Pflegedienst, auf den sie sich blind verlassen kann, damit sie ihr eigenes Leben wieder leben kann.`,
  },
  kunden: {
    label: 'Kund:innen / Patient:innen',
    persona: `Berthold, 79, pensionierter Werksleiter, lebt allein. Nach einem Sturz ändert sich alles.
Wünscht sich Normalität und Selbstbestimmung, einen geregelten Tag, an dem er frei entscheiden kann.
Weg von: "Pflege hält einen nur am Leben".
Hin zu: frischem Wind und Lebensfreude.`,
  },
  allgemein: {
    label: 'Allgemein / Community',
    persona: `Menschen aus der Region (NRW & Niedersachsen), Kolleg:innen, Partner:innen und Fans der Pflegeunion.
Ziel: Sympathie, Vertrauen und Neugier auf die Pflegeunion wecken.`,
  },
} as const;

export type AudienceId = keyof typeof audiences;

export const requiredHashtag = '#Pflegeunion';
export const website = 'pflegeunion.de';
