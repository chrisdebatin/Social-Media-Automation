'use client';

import { useEffect, useRef, useState } from 'react';
import { charCount, templateCatalog, templateIds, type Slide, type TemplateId, type SlotSpec } from '@/lib/schema';
import type { HeadlineStyle } from '@/lib/brand';
import type { Issue } from '@/lib/validate';
import type { Status } from './Studio';
import { thumbSrc, type LibPhoto } from './util';

const STYLE_LABEL: Record<HeadlineStyle, string> = { standard: 'Standard', eingerueckt: 'Eingerückt', vertikal: 'Vertikal' };

interface Props {
  slide: Slide;
  index: number;
  total: number;
  issues: Issue[];
  status: Status | null;
  photos: LibPhoto[];
  busy: boolean;
  onChange: (patch: Partial<Slide>) => void;
  onTemplate: (t: TemplateId) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onRewrite: (instruction: string) => void;
  onUpload: (f: File) => void;
  onAiImage: (prompt: string) => void;
  onPreview: (id: string, url: string, overflow: string[]) => void;
}

/** Debounced live PNG preview from /api/render. */
function usePreview(slide: Slide, index: number, total: number, onPreview: Props['onPreview']) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify({ slide, index, total });
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slide, index, total, preview: true }),
          signal: ctrl.signal,
        });
        if (!r.ok) return;
        const overflow = (r.headers.get('X-Overflow') || '').split(',').filter(Boolean);
        const u = URL.createObjectURL(await r.blob());
        if (lastUrl.current) setTimeout(((old) => () => URL.revokeObjectURL(old))(lastUrl.current), 30000);
        lastUrl.current = u;
        setUrl(u);
        onPreview(slide.id, u, overflow);
      } catch {
        /* aborted */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { url, loading };
}

export default function SlideCard(p: Props) {
  const { slide: s, index, total } = p;
  const spec = templateCatalog[s.template];
  const { url, loading } = usePreview(s, index, total, p.onPreview);
  const [instruction, setInstruction] = useState('');
  const [aiPrompt, setAiPrompt] = useState(s.imagePrompt ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const fieldIssues = (f: string) => p.issues.filter((x) => x.field === f || x.field?.startsWith(`${f}.`));

  useEffect(() => setAiPrompt(s.imagePrompt ?? ''), [s.imagePrompt]);

  const slotField = (slot: SlotSpec) => {
    const v = s[slot.key] ?? '';
    const n = charCount(v);
    const over = n > slot.max || fieldIssues(slot.key).some((x) => x.severity === 'error' && x.message.includes('passt nicht'));
    const multiline = slot.multiline || slot.key === 'headline';
    return (
      <div key={slot.key} className={`field ${over ? 'over' : ''}`}>
        <label>
          {slot.label}{slot.required ? '' : ' (optional)'}
          <span className={`counter ${n > slot.max ? 'bad' : ''}`}>{n}/{slot.max}</span>
        </label>
        {multiline ? (
          <textarea rows={slot.key === 'headline' ? 2 : 3} value={v} onChange={(e) => p.onChange({ [slot.key]: e.target.value })} />
        ) : (
          <input type="text" value={v} onChange={(e) => p.onChange({ [slot.key]: e.target.value })} />
        )}
        {slot.key === 'headline' && (s.headlineStyle === 'eingerueckt') && (
          <div className="hint">Eingerückt: optional mit Zeilenumbruch festlegen, wo die zweite Zeile beginnt.</div>
        )}
      </div>
    );
  };

  return (
    <section className="panel">
      <div className="slide-head">
        <span className="num">{index + 1}</span>
        <select value={s.template} onChange={(e) => p.onTemplate(e.target.value as TemplateId)} style={{ width: 'auto' }}>
          {templateIds.map((t) => <option key={t} value={t}>{templateCatalog[t].label}</option>)}
        </select>
        {spec.headlineStyles.length > 1 && (
          <select value={s.headlineStyle ?? spec.defaultHeadlineStyle} onChange={(e) => p.onChange({ headlineStyle: e.target.value as HeadlineStyle })} style={{ width: 'auto' }} title="Headline-Stil">
            {spec.headlineStyles.map((h) => <option key={h} value={h}>{STYLE_LABEL[h]}</option>)}
          </select>
        )}
        <span className="grow" />
        <button className="btn icon" title="Nach oben" disabled={index === 0} onClick={() => p.onMove(-1)}>↑</button>
        <button className="btn icon" title="Nach unten" disabled={index === total - 1} onClick={() => p.onMove(1)}>↓</button>
        <button className="btn icon danger" title="Slide löschen" disabled={total <= 1} onClick={p.onRemove}>✕</button>
      </div>

      <div className="slide">
        <div>
          <div className="preview">
            {url && <img src={url} alt={`Vorschau Slide ${index + 1}`} />}
            {loading && <span className="busy">rendert …</span>}
          </div>
          <div className="hint">{spec.description}</div>
        </div>

        <div>
          {spec.slots.map(slotField)}

          {spec.bullets && (
            <div className="field">
              <label>Punkte ({spec.bullets.min}–{spec.bullets.max})</label>
              {(s.bullets ?? []).map((b, k) => {
                const n = charCount(b);
                return (
                  <div key={k} className={`row ${n > spec.bullets!.maxChars ? 'over' : ''}`} style={{ marginBottom: 6 }}>
                    <input type="text" className="grow" style={{ width: 'auto' }} value={b}
                      onChange={(e) => p.onChange({ bullets: (s.bullets ?? []).map((x, j) => (j === k ? e.target.value : x)) })} />
                    <span className={`counter ${n > spec.bullets!.maxChars ? 'bad' : ''}`}>{n}/{spec.bullets!.maxChars}</span>
                    <button className="btn icon" title="Punkt entfernen" onClick={() => p.onChange({ bullets: (s.bullets ?? []).filter((_, j) => j !== k) })}>✕</button>
                  </div>
                );
              })}
              {(s.bullets?.length ?? 0) < spec.bullets.max && (
                <button className="btn small" onClick={() => p.onChange({ bullets: [...(s.bullets ?? []), ''] })}>+ Punkt</button>
              )}
            </div>
          )}

          {spec.photo !== 'none' && (
            <div className="field">
              <label>{spec.photo === 'cutout' ? 'Freigestelltes Porträt' : 'Foto'}{s.photo?.ai ? ' · KI-generiert' : ''}</label>
              <div className="thumbs">
                {p.photos.map((ph) => (
                  <button key={ph.id} className={`thumb ${ph.kind === 'cutout' ? 'cutout' : ''} ${s.photo?.src === ph.src ? 'selected' : ''}`}
                    title={ph.note} onClick={() => p.onChange({ photo: { src: ph.src, ai: ph.ai, note: ph.note } })}>
                    <img src={thumbSrc(ph.src)} alt="" />
                    {ph.ai && <span className="badge">KI</span>}
                    {ph.name && <span className="badge">{ph.name}</span>}
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input ref={fileRef} type="file" hidden accept={spec.photo === 'cutout' ? 'image/png,image/webp' : 'image/jpeg,image/png,image/webp'}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onUpload(f); e.target.value = ''; }} />
                <button className="btn small" onClick={() => fileRef.current?.click()}>Hochladen</button>
                {s.photo && <button className="btn small" onClick={() => p.onChange({ photo: null })}>Foto entfernen</button>}
              </div>
              {spec.photo === 'cutout' && <div className="hint">PNG mit transparentem Hintergrund. KI-Bilder sind für echte Mitarbeitende nicht erlaubt.</div>}
              {spec.photo === 'photo' && p.status?.aiImages && (
                <div className="row" style={{ marginTop: 8 }}>
                  <input type="text" className="grow" style={{ width: 'auto' }} placeholder="Bildidee (Englisch), z. B. caregiver helping an elderly man in his garden"
                    value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
                  <button className="btn small green" disabled={p.busy || aiPrompt.trim().length < 10} onClick={() => p.onAiImage(aiPrompt)}>KI-Bild generieren</button>
                </div>
              )}
            </div>
          )}

          {p.status?.aiText && (
            <div className="row" style={{ marginTop: 4 }}>
              <input type="text" className="grow" style={{ width: 'auto' }} placeholder="Wunsch (optional), z. B. „kürzer“ oder „mit Frage“"
                value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <button className="btn small" disabled={p.busy} onClick={() => p.onRewrite(instruction)}>Neu formulieren</button>
            </div>
          )}

          {p.issues.length > 0 && (
            <ul className="issues">
              {p.issues.map((x, k) => <li key={k} className={x.severity}>{x.field ? `${x.field}: ` : ''}{x.message}</li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
