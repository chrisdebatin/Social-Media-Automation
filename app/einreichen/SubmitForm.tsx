'use client';

import { useRef, useState } from 'react';
import { downscale } from '../studio/util';

const MAX_TEXT = 600;

export default function SubmitForm({ submitKey, locations }: { submitKey: string; locations: string[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [noHealth, setNoHealth] = useState(false);
  const [state, setState] = useState<'form' | 'sending' | 'done'>('form');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList) {
    setError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 3) break;
      try {
        next.push(await downscale(f, 1600, { forceJpeg: true, maxBytes: 1.4 * 1024 * 1024 }));
      } catch {
        setError('Ein Foto konnte nicht gelesen werden.');
      }
    }
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  async function send() {
    setState('sending');
    setError(null);
    const fd = new FormData();
    fd.append('k', submitKey);
    fd.append('name', name);
    fd.append('location', location);
    fd.append('text', text);
    fd.append('consent', String(consent && noHealth));
    files.forEach((f) => fd.append('photos', f, f.name));
    try {
      const r = await fetch('/api/submit', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Senden fehlgeschlagen');
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('form');
    }
  }

  if (state === 'done') {
    return (
      <div className="panel">
        <h2>Danke dir!</h2>
        <p>Dein Beitrag ist angekommen. Das Marketing schaut ihn sich an und meldet sich, bevor etwas veröffentlicht wird.</p>
        <button className="btn green" onClick={() => { setFiles([]); setPreviews([]); setText(''); setConsent(false); setNoHealth(false); setState('form'); }}>
          Noch etwas einreichen
        </button>
      </div>
    );
  }

  const ready = files.length > 0 && text.trim().length >= 10 && consent && noHealth && state === 'form';
  return (
    <div className="panel">
      <h2>Zeig uns deinen Moment!</h2>
      <p className="hint" style={{ fontSize: 14 }}>Ein schönes Erlebnis aus deinem Arbeitsalltag? Schick uns 1–3 Fotos und ein paar Sätze – wir machen einen Instagram-Beitrag daraus.</p>

      <div className="field">
        <label>Fotos (1–3)</label>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
        <div className="thumbs">
          {previews.map((src, i) => (
            <div key={src} className="thumb">
              <img src={src} alt="" />
              <button className="x" title="Entfernen" onClick={() => { const f = files.filter((_, k) => k !== i); setFiles(f); setPreviews(f.map((x) => URL.createObjectURL(x))); }}>×</button>
            </div>
          ))}
          {files.length < 3 && <button className="thumb add" onClick={() => input.current?.click()}>+ Foto</button>}
        </div>
      </div>

      <div className="field">
        <label htmlFor="t">Was ist passiert? <span className={`counter ${text.length > MAX_TEXT ? 'bad' : ''}`}>{text.length}/{MAX_TEXT}</span></label>
        <textarea id="t" rows={4} maxLength={MAX_TEXT} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="z. B. Heute haben wir mit unseren Kund:innen im Garten Kartoffeln geerntet …" />
      </div>
      <div className="field">
        <label htmlFor="n">Dein Vorname (optional, für die Nennung im Beitrag)</label>
        <input id="n" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="l">Standort</label>
        <select id="l" value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">bitte wählen</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Alle erkennbaren Personen auf den Fotos haben zugestimmt, dass die Bilder auf Instagram veröffentlicht werden.</label>
      <label className="check"><input type="checkbox" checked={noHealth} onChange={(e) => setNoHealth(e.target.checked)} />
        Auf den Fotos sind keine Gesundheitsdaten, Dokumente, Medikamentenpläne oder Adressen zu sehen.</label>

      {error && <div className="banner error" style={{ marginTop: 10 }}>{error}</div>}
      <button className="btn primary" style={{ width: '100%', marginTop: 14, padding: 14 }} disabled={!ready} onClick={send}>
        {state === 'sending' ? 'Wird gesendet …' : 'Absenden'}
      </button>
      <p className="hint">Es wird nichts automatisch veröffentlicht – das Marketing prüft jeden Beitrag vorher.</p>
    </div>
  );
}
