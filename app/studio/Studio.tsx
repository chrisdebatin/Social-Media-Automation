'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  CAPTION_MAX, charCount, emptySlide, fullCaption, newId, templateCatalog, templateIds,
  type Carousel, type Slide, type TemplateId,
} from '@/lib/schema';
import { validateCarousel, type Issue } from '@/lib/validate';
import { requiredHashtag } from '@/lib/brand';
import SlideCard from './SlideCard';
import InstaPreview from './InstaPreview';
import { downscale, thumbSrc, type LibPhoto } from './util';

export interface Status {
  aiText: boolean;
  aiImages: boolean;
  storage: 'blob' | 'local' | 'none';
  drafts: boolean;
  instagram: boolean;
  accentFontLicensed: boolean;
  model: string;
  people: { id: string; name: string; src: string }[];
  audiences: { id: string; label: string }[];
  locations: string[];
}

type Busy = null | string;
const blankCarousel = (): Carousel => ({
  slides: [emptySlide('cover'), emptySlide('text'), emptySlide('cta')],
  caption: '',
  hashtags: [requiredHashtag],
});

export default function Studio() {
  const [status, setStatus] = useState<Status | null>(null);
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [library, setLibrary] = useState<LibPhoto[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  // briefing
  const [inputMode, setInputMode] = useState<'briefing' | 'article'>('briefing');
  const [briefing, setBriefing] = useState('');
  const [articleUrl, setArticleUrl] = useState('');
  const [articleText, setArticleText] = useState('');
  const [audience, setAudience] = useState('allgemein');
  const [location, setLocation] = useState('');
  const [slideCount, setSlideCount] = useState(6);
  const [allowAiImages, setAllowAiImages] = useState(false);
  // state
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiIssues, setAiIssues] = useState<Issue[]>([]);
  const [overflow, setOverflow] = useState<Record<string, string[]>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<{ id: string; title: string } | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [newTemplate, setNewTemplate] = useState<TemplateId>('text');
  const [hashtagText, setHashtagText] = useState('');
  const [draftTitle, setDraftTitle] = useState('');

  /* ------------------------------------------------------------ status */
  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then((s: Status) => {
      setStatus(s);
      setAllowAiImages(false);
    }).catch(() => setError('Status konnte nicht geladen werden.'));
  }, []);

  // ?draft=<id> → load shared draft (review by a colleague)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('draft');
    if (id) void loadDraft(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (carousel) setHashtagText(carousel.hashtags.join(' '));
    // only when hashtags change from outside (generation / draft load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carousel?.hashtags.join(' ')]);

  /* --------------------------------------------------------- validation */
  const issues = useMemo<Issue[]>(() => {
    if (!carousel) return [];
    const base = validateCarousel(carousel, { mode: 'manual' });
    carousel.slides.forEach((s, i) => {
      for (const slot of overflow[s.id] ?? []) base.push({ severity: 'error', slide: i, field: slot, message: `Text in "${slot}" passt nicht ins Layout – bitte kürzen.` });
    });
    return base;
  }, [carousel, overflow]);
  const errors = issues.filter((i) => i.severity === 'error');
  const globalIssues = issues.filter((i) => i.slide === undefined);

  /* ----------------------------------------------------------- helpers */
  const updateSlide = useCallback((id: string, patch: Partial<Slide>) => {
    setCarousel((c) => c && { ...c, slides: c.slides.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }, []);

  const onPreview = useCallback((id: string, url: string, slots: string[]) => {
    setPreviews((p) => ({ ...p, [id]: url }));
    setOverflow((o) => (o[id]?.join() === slots.join() ? o : { ...o, [id]: slots }));
  }, []);

  function moveSlide(i: number, dir: -1 | 1) {
    setCarousel((c) => {
      if (!c) return c;
      const j = i + dir;
      if (j < 0 || j >= c.slides.length) return c;
      const slides = [...c.slides];
      [slides[i], slides[j]] = [slides[j], slides[i]];
      return { ...c, slides };
    });
  }

  function removeSlide(i: number) {
    setCarousel((c) => (c && c.slides.length > 1 ? { ...c, slides: c.slides.filter((_, k) => k !== i) } : c));
  }

  function addSlide() {
    setCarousel((c) => {
      if (!c || c.slides.length >= 10) return c;
      const slides = [...c.slides];
      const lastIsCta = slides[slides.length - 1]?.template === 'cta';
      slides.splice(lastIsCta && newTemplate !== 'cta' ? slides.length - 1 : slides.length, 0, emptySlide(newTemplate));
      return { ...c, slides };
    });
  }

  function changeTemplate(i: number, template: TemplateId) {
    setCarousel((c) => {
      if (!c) return c;
      const old = c.slides[i];
      const next = emptySlide(template, old.id);
      const spec = templateCatalog[template];
      for (const slot of spec.slots) {
        const v = old[slot.key] ?? (slot.key === 'quote' ? old.body ?? old.headline : slot.key === 'body' ? old.quote ?? old.subline : undefined);
        if (v) next[slot.key] = v;
      }
      if (spec.bullets && old.bullets?.length) next.bullets = old.bullets;
      if (spec.photo !== 'none' && old.photo && templateCatalog[old.template].photo === spec.photo) next.photo = old.photo;
      return { ...c, slides: c.slides.map((s, k) => (k === i ? next : s)) };
    });
  }

  /* ------------------------------------------------------------ photos */
  async function uploadFiles(files: FileList | File[], kind?: 'photo' | 'cutout'): Promise<LibPhoto[]> {
    const added: LibPhoto[] = [];
    setBusy('Fotos werden hochgeladen …');
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const small = await downscale(f);
        const fd = new FormData();
        fd.append('file', small, small.name);
        const r = await fetch('/api/upload', { method: 'POST', body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Upload fehlgeschlagen');
        added.push({ id: newId(), src: j.url, kind: kind ?? (j.cutout ? 'cutout' : 'photo'), note: '' });
      }
      setLibrary((l) => [...l, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
    return added;
  }

  async function generateAiImage(prompt: string): Promise<LibPhoto> {
    const r = await fetch('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'KI-Bild fehlgeschlagen');
    const p: LibPhoto = { id: newId(), src: j.url, kind: 'photo', note: `KI: ${prompt}`, ai: true };
    setLibrary((l) => [...l, p]);
    return p;
  }

  /* -------------------------------------------------------- generation */
  async function generate() {
    if (!status) return;
    setBusy('KI schreibt das Karussell … (bis zu 1 Minute)');
    setError(null);
    setNotice(null);
    setAiIssues([]);
    const people = status.people.filter((p) => selectedPeople.includes(p.id));
    const pool = [
      ...library.map((p) => ({ src: p.src, info: { kind: p.kind, note: p.note || undefined } })),
      ...people.map((p) => ({ src: p.src, info: { kind: 'cutout' as const, name: p.name, note: `Team-Porträt von ${p.name}` } })),
    ];
    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'carousel',
          briefing,
          articleUrl: inputMode === 'article' && articleUrl.trim() ? articleUrl.trim() : undefined,
          articleText: inputMode === 'article' && !articleUrl.trim() && articleText.trim() ? articleText.trim() : undefined,
          audience,
          location: location || undefined,
          slideCount,
          photos: pool.map((p) => p.info),
          photoSrcs: pool.map((p) => p.src),
          allowAiImages: allowAiImages && status.aiImages,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Generierung fehlgeschlagen');
      const c = j.carousel as Carousel;
      // mark AI-generated photos from the library
      c.slides = c.slides.map((s) => (s.photo ? { ...s, photo: { ...s.photo, ai: library.find((p) => p.src === s.photo!.src)?.ai } } : s));
      setCarousel(c);
      setOverflow({});
      setDraft(null);
      setAiIssues(j.ok ? [] : (j.issues as Issue[]).filter((i) => i.severity === 'error'));
      setNotice(j.ok ? `Fertig nach ${j.attempts} Versuch${j.attempts > 1 ? 'en' : ''} – bitte prüfen und anpassen.` : null);

      // fill missing photos with AI images
      const missing = c.slides.filter((s) => s.imagePrompt && !s.photo?.src);
      if (allowAiImages && status.aiImages && missing.length) {
        for (const [k, s] of missing.entries()) {
          setBusy(`KI-Bild ${k + 1}/${missing.length} wird erstellt …`);
          try {
            const p = await generateAiImage(s.imagePrompt!);
            updateSlide(s.id, { photo: { src: p.src, ai: true } });
          } catch (e) {
            setError(`KI-Bild für Slide „${s.headline ?? ''}“: ${e instanceof Error ? e.message : e}`);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function rewrite(i: number, instruction: string) {
    if (!carousel) return;
    setBusy(`Slide ${i + 1} wird neu formuliert …`);
    setError(null);
    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'slide', carousel, index: i, instruction: instruction || undefined, audience, briefing }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Neu formulieren fehlgeschlagen');
      updateSlide(carousel.slides[i].id, j.slide);
      const errs = (j.issues as Issue[]).filter((x) => x.severity === 'error');
      if (errs.length) setError(`Slide ${i + 1}: KI konnte nicht alle Regeln einhalten – bitte prüfen.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function startBlank() {
    setCarousel(blankCarousel());
    setOverflow({});
    setAiIssues([]);
    setDraft(null);
    setNotice('Leere Vorlage – Texte direkt in die Felder schreiben.');
  }

  /* --------------------------------------------------------------- ZIP */
  async function downloadZip() {
    if (!carousel) return;
    setBusy('ZIP wird erstellt …');
    setError(null);
    try {
      const zip = new JSZip();
      const n = carousel.slides.length;
      for (let i = 0; i < n; i++) {
        setBusy(`ZIP: Slide ${i + 1}/${n} …`);
        const r = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slide: carousel.slides[i], index: i, total: n, format: 'png' }),
        });
        if (!r.ok) throw new Error((await r.json()).error || 'Render fehlgeschlagen');
        zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, await r.blob());
      }
      zip.file('caption.txt', fullCaption(carousel));
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pflegeunion-karussell-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /* ------------------------------------------------------------ drafts */
  async function saveDraft() {
    if (!carousel) return;
    const title = (draftTitle.trim() || carousel.slides[0]?.headline?.trim() || 'Neuer Entwurf').slice(0, 120);
    const id = draft?.id ?? newId() + newId();
    setBusy('Entwurf wird gespeichert …');
    try {
      const r = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...carousel, id, title: title || 'Ohne Titel', briefing, audience, location, updatedAt: '' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setDraft({ id, title });
      const link = `${window.location.origin}/?draft=${id}`;
      window.history.replaceState(null, '', `/?draft=${id}`);
      setNotice(`Entwurf gespeichert. Link für Kolleg:innen: ${link}`);
    } catch (e) {
      setError(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }

  async function loadDraft(id: string) {
    setBusy('Entwurf wird geladen …');
    try {
      const r = await fetch(`/api/drafts/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setCarousel({ slides: j.slides, caption: j.caption, hashtags: j.hashtags });
      setBriefing(j.briefing ?? '');
      if (j.audience) setAudience(j.audience);
      setLocation(j.location ?? '');
      setDraft({ id: j.id, title: j.title });
      setDraftTitle(j.title);
      setOverflow({});
      setShowDrafts(false);
      window.history.replaceState(null, '', `/?draft=${id}`);
      setNotice(`Entwurf „${j.title}“ geladen.`);
    } catch (e) {
      setError(`Entwurf: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }

  /* ----------------------------------------------------------- publish */
  const publishBlockers: string[] = [];
  if (status && !status.instagram) publishBlockers.push('Instagram ist nicht konfiguriert');
  if (status && status.storage !== 'blob') publishBlockers.push('Vercel Blob fehlt (öffentliche Bild-URLs)');
  if (errors.length) publishBlockers.push(`${errors.length} Fehler offen`);
  if (busy) publishBlockers.push('bitte warten');

  /* ------------------------------------------------------------ render */
  const hashtagCount = carousel ? charCount(fullCaption(carousel)) : 0;
  const libPhotos = library.filter((p) => p.kind === 'photo');
  const cutouts: LibPhoto[] = [
    ...(status?.people ?? []).map((p) => ({ id: p.id, src: p.src, kind: 'cutout' as const, note: p.name, name: p.name })),
    ...library.filter((p) => p.kind === 'cutout'),
  ];

  return (
    <>
      <header className="header">
        <img src="/api/asset/brand/logo-hauptversion.png" alt="Pflegeunion" />
        <h1>Social Studio</h1>
        {status && (
          <div className="chips">
            <span className={`chip ${status.aiText ? 'on' : ''}`} title={status.model}>KI-Text {status.aiText ? '✓' : '–'}</span>
            <span className={`chip ${status.aiImages ? 'on' : ''}`}>KI-Bilder {status.aiImages ? '✓' : '–'}</span>
            <span className={`chip ${status.storage === 'blob' ? 'on' : status.storage === 'local' ? 'warn' : ''}`}>
              Speicher: {status.storage === 'blob' ? 'Vercel Blob' : status.storage === 'local' ? 'lokal' : '–'}
            </span>
            <span className={`chip ${status.instagram ? 'on' : ''}`}>Instagram {status.instagram ? '✓' : '–'}</span>
            <span className={`chip ${status.accentFontLicensed ? 'on' : 'warn'}`} title={status.accentFontLicensed ? '' : 'Nifty Script fehlt – Caveat wird als Ersatz verwendet'}>
              Akzentschrift: {status.accentFontLicensed ? 'Nifty Script' : 'Ersatz (Caveat)'}
            </span>
          </div>
        )}
      </header>

      <div className="layout">
        {/* ============================================== left panel */}
        <aside className="sidebar">
          <div className="panel">
            <h2>1. Inhalt</h2>
            <div className="tabs">
              <button className={`tab ${inputMode === 'briefing' ? 'active' : ''}`} onClick={() => setInputMode('briefing')}>Briefing</button>
              <button className={`tab ${inputMode === 'article' ? 'active' : ''}`} onClick={() => setInputMode('article')}>Artikel umarbeiten</button>
            </div>
            {inputMode === 'briefing' ? (
              <div className="field">
                <label htmlFor="briefing">Thema / Briefing</label>
                <textarea id="briefing" rows={6} value={briefing} onChange={(e) => setBriefing(e.target.value)}
                  placeholder="z. B. 5 Tipps für mehr Bewegung im Alltag für Senior:innen – mit Hinweis auf unsere Alltagshilfe" />
              </div>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="url">Artikel-URL (pflegeunion.de)</label>
                  <input id="url" type="url" value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="https://pflegeunion.de/…" />
                </div>
                <div className="field">
                  <label htmlFor="atext">… oder Text einfügen</label>
                  <textarea id="atext" rows={5} value={articleText} onChange={(e) => setArticleText(e.target.value)} disabled={!!articleUrl.trim()} />
                </div>
                <div className="field">
                  <label htmlFor="b2">Zusätzliche Hinweise (optional)</label>
                  <textarea id="b2" rows={2} value={briefing} onChange={(e) => setBriefing(e.target.value)} />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="aud">Zielgruppe</label>
              <select id="aud" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {status?.audiences.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="loc">Standort (optional)</label>
              <input id="loc" type="text" list="locations" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="alle Standorte" />
              <datalist id="locations">{status?.locations.map((l) => <option key={l} value={l} />)}</datalist>
            </div>
            <div className="field">
              <label htmlFor="count">Anzahl Slides: {slideCount}</label>
              <input id="count" type="range" min={2} max={10} value={slideCount} onChange={(e) => setSlideCount(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>

          <div className="panel">
            <h2>2. Fotos</h2>
            <PhotoUpload onFiles={(f) => uploadFiles(f)} />
            {library.length > 0 && (
              <div className="thumbs" style={{ marginTop: 10 }}>
                {library.map((p) => (
                  <div key={p.id}>
                    <div className={`thumb ${p.kind === 'cutout' ? 'cutout' : ''}`}>
                      <img src={thumbSrc(p.src)} alt="" />
                      {p.ai && <span className="badge">KI</span>}
                      {p.kind === 'cutout' && <span className="badge">freigestellt</span>}
                      <button className="x" title="Entfernen" onClick={() => setLibrary((l) => l.filter((x) => x.id !== p.id))}>×</button>
                    </div>
                    <input className="photo-note" type="text" placeholder="Notiz" value={p.note}
                      onChange={(e) => setLibrary((l) => l.map((x) => (x.id === p.id ? { ...x, note: e.target.value } : x)))} />
                  </div>
                ))}
              </div>
            )}
            {status && status.people.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h3>Team-Porträts (freigestellt)</h3>
                <div className="thumbs">
                  {status.people.map((p) => {
                    const on = selectedPeople.includes(p.id);
                    return (
                      <button key={p.id} className={`thumb cutout ${on ? 'selected' : ''}`} title={p.name}
                        onClick={() => setSelectedPeople((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}>
                        <img src={thumbSrc(p.src)} alt={p.name} />
                        <span className="badge">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="hint">Ausgewählte Personen kann die KI für „Kennst du schon …“-Slides verwenden.</div>
              </div>
            )}
            <label className="row" style={{ marginTop: 12, fontWeight: 400 }}>
              <input type="checkbox" checked={allowAiImages} disabled={!status?.aiImages} onChange={(e) => setAllowAiImages(e.target.checked)} />
              Fehlende Fotos mit KI generieren {!status?.aiImages && <span className="hint">(nicht konfiguriert)</span>}
            </label>
          </div>

          <div className="panel">
            <div className="row">
              <button className="btn primary grow" disabled={!status?.aiText || !!busy || (!briefing.trim() && !articleUrl.trim() && !articleText.trim())} onClick={generate}>
                Karussell erstellen
              </button>
              <button className="btn" disabled={!!busy} onClick={startBlank}>Leer starten</button>
            </div>
            {!status?.aiText && status && <div className="hint">Ohne ANTHROPIC_API_KEY: manueller Modus über „Leer starten“.</div>}
            {status?.drafts && (
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn small" onClick={() => setShowDrafts(true)}>Entwürfe öffnen</button>
              </div>
            )}
          </div>
        </aside>

        {/* ============================================== main area */}
        <main className="main">
          {busy && <div className="banner info">{busy}</div>}
          {error && <div className="banner error">{error} <button className="btn small" onClick={() => setError(null)}>OK</button></div>}
          {notice && !busy && <div className="banner ok">{notice}</div>}
          {aiIssues.length > 0 && (
            <div className="banner error">
              Die KI konnte nach 3 Versuchen nicht alle Regeln einhalten. Bitte diese Punkte manuell korrigieren (siehe Markierungen an den Slides).
            </div>
          )}

          {!carousel ? (
            <div className="panel">
              <h2>Willkommen im Social Studio</h2>
              <p>Gib links ein Thema ein oder füge einen Artikel von pflegeunion.de ein und klicke auf <b>Karussell erstellen</b>.
                Layout, Farben, Schriften und Logo kommen immer automatisch aus dem Pflegeunion-Design – du kümmerst dich nur um Inhalt und Fotos.</p>
              <p>Ohne KI geht es mit <b>Leer starten</b>.</p>
            </div>
          ) : (
            <>
              <div className="panel row">
                {status?.drafts ? (
                  <input type="text" className="grow" style={{ width: 'auto' }} placeholder="Titel des Entwurfs" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                ) : <span className="grow" />}
                {status?.drafts && <button className="btn small" disabled={!!busy} onClick={saveDraft}>Entwurf speichern</button>}
                <button className="btn small" disabled={!!busy} onClick={downloadZip}>ZIP herunterladen</button>
                <button className="btn small primary" disabled={publishBlockers.length > 0} title={publishBlockers.join(', ')} onClick={() => setShowPublish(true)}>
                  Auf Instagram posten
                </button>
              </div>
              {publishBlockers.length > 0 && !busy && (
                <div className="hint">Posten noch nicht möglich: {publishBlockers.join(' · ')}</div>
              )}

              {carousel.slides.map((s, i) => (
                <SlideCard
                  key={s.id}
                  slide={s}
                  index={i}
                  total={carousel.slides.length}
                  issues={issues.filter((x) => x.slide === i)}
                  status={status}
                  photos={templateCatalog[s.template].photo === 'cutout' ? cutouts : libPhotos}
                  busy={!!busy}
                  onChange={(patch) => updateSlide(s.id, patch)}
                  onTemplate={(t) => changeTemplate(i, t)}
                  onMove={(d) => moveSlide(i, d)}
                  onRemove={() => removeSlide(i)}
                  onRewrite={(instr) => rewrite(i, instr)}
                  onUpload={async (f) => {
                    const added = await uploadFiles([f], templateCatalog[s.template].photo === 'cutout' ? 'cutout' : 'photo');
                    if (added[0]) updateSlide(s.id, { photo: { src: added[0].src } });
                  }}
                  onAiImage={async (prompt) => {
                    setBusy('KI-Bild wird erstellt …');
                    try {
                      const p = await generateAiImage(prompt);
                      updateSlide(s.id, { photo: { src: p.src, ai: true }, imagePrompt: prompt });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                  onPreview={onPreview}
                />
              ))}

              <div className="panel row">
                <select value={newTemplate} onChange={(e) => setNewTemplate(e.target.value as TemplateId)} style={{ width: 'auto' }}>
                  {templateIds.map((t) => <option key={t} value={t}>{templateCatalog[t].label}</option>)}
                </select>
                <button className="btn small green" disabled={carousel.slides.length >= 10} onClick={addSlide}>Slide hinzufügen</button>
                <span className="hint">{carousel.slides.length}/10 Slides</span>
              </div>

              <div className="panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                <div>
                  <h2>Caption</h2>
                  <div className="field">
                    <label htmlFor="cap">Text <span className={`counter ${hashtagCount > CAPTION_MAX ? 'bad' : ''}`}>{hashtagCount}/{CAPTION_MAX} inkl. Hashtags</span></label>
                    <textarea id="cap" rows={8} value={carousel.caption} onChange={(e) => setCarousel({ ...carousel, caption: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="tags">Hashtags <span className="counter">{carousel.hashtags.length}/30</span></label>
                    <input id="tags" type="text" value={hashtagText}
                      onChange={(e) => setHashtagText(e.target.value)}
                      onBlur={() => setCarousel({ ...carousel, hashtags: hashtagText.split(/[\s,]+/).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`)) })} />
                    <div className="hint">Mit Leerzeichen trennen. {requiredHashtag} ist Pflicht.</div>
                  </div>
                  {globalIssues.length > 0 && (
                    <ul className="issues">{globalIssues.map((x, k) => <li key={k} className={x.severity}>{x.message}</li>)}</ul>
                  )}
                </div>
                <div>
                  <h2>Instagram-Vorschau</h2>
                  <InstaPreview slides={carousel.slides} previews={previews} caption={fullCaption(carousel)} />
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {showDrafts && <DraftsDialog onClose={() => setShowDrafts(false)} onLoad={loadDraft} />}
      {showPublish && carousel && (
        <PublishDialog carousel={carousel} onClose={() => setShowPublish(false)} />
      )}
    </>
  );
}

/* ================================================================ parts */

function PhotoUpload({ onFiles }: { onFiles: (f: FileList) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; }} />
      <button className="btn small green" onClick={() => ref.current?.click()}>Fotos hochladen</button>
      <div className="hint">Mehrere Fotos möglich. PNGs mit transparentem Hintergrund werden als freigestellte Porträts erkannt.</div>
    </>
  );
}

function DraftsDialog({ onClose, onLoad }: { onClose: () => void; onLoad: (id: string) => void }) {
  const [drafts, setDrafts] = useState<{ id: string; title: string; updatedAt: string; slides: number }[] | null>(null);
  const load = () => fetch('/api/drafts').then((r) => r.json()).then((j) => setDrafts(j.drafts ?? []));
  useEffect(() => { void load(); }, []);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Entwürfe</h2>
        {!drafts ? <p>Lade …</p> : drafts.length === 0 ? <p>Noch keine Entwürfe.</p> : drafts.map((d) => (
          <div key={d.id} className="draft-row">
            <div className="grow"><b>{d.title}</b><div className="hint">{new Date(d.updatedAt).toLocaleString('de-DE')} · {d.slides} Slides</div></div>
            <button className="btn small green" onClick={() => onLoad(d.id)}>Öffnen</button>
            <button className="btn small danger" onClick={async () => { await fetch(`/api/drafts/${d.id}`, { method: 'DELETE' }); void load(); }}>Löschen</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 14 }}><button className="btn" onClick={onClose}>Schließen</button></div>
      </div>
    </div>
  );
}

function PublishDialog({ carousel, onClose }: { carousel: Carousel; onClose: () => void }) {
  const [quota, setQuota] = useState<{ remaining: number; total: number } | null>(null);
  const [state, setState] = useState<'confirm' | 'posting' | 'done' | 'error'>('confirm');
  const [result, setResult] = useState<{ permalink: string | null; warnings: string[] } | null>(null);
  const [err, setErr] = useState('');
  const hasAi = carousel.slides.some((s) => s.photo?.ai);

  useEffect(() => {
    fetch('/api/publish').then((r) => r.json()).then((j) => !j.error && setQuota(j)).catch(() => {});
  }, []);

  async function post() {
    setState('posting');
    try {
      const r = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ carousel }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setResult(j);
      setState('done');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  }

  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>Auf Instagram posten</h2>
        {state === 'confirm' && (
          <>
            <p>Das Karussell mit <b>{carousel.slides.length} Slide{carousel.slides.length > 1 ? 's' : ''}</b> wird sofort öffentlich auf dem Pflegeunion-Account veröffentlicht.</p>
            {hasAi && <p>Enthält KI-Bilder → wird mit KI-Kennzeichnung veröffentlicht.</p>}
            <p className="hint">{quota ? `Kontingent: noch ${quota.remaining} von ${quota.total} Beiträgen in 24 h.` : 'Kontingent wird geprüft …'}</p>
            <div className="row">
              <button className="btn primary" onClick={post} disabled={quota?.remaining === 0}>Jetzt veröffentlichen</button>
              <button className="btn" onClick={onClose}>Abbrechen</button>
            </div>
          </>
        )}
        {state === 'posting' && <p>Wird veröffentlicht … Slides werden gerendert und an Instagram übergeben (kann 1–2 Minuten dauern). Fenster bitte offen lassen.</p>}
        {state === 'done' && result && (
          <>
            <div className="banner ok">Veröffentlicht!</div>
            {result.permalink && <p><a href={result.permalink} target="_blank" rel="noreferrer">{result.permalink}</a></p>}
            {result.warnings.map((w, i) => <p key={i} className="hint">{w}</p>)}
            <button className="btn" onClick={onClose}>Schließen</button>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="banner error">{err}</div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => setState('confirm')}>Zurück</button>
              <button className="btn" onClick={onClose}>Schließen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
