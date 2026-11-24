'use client';

import { useState } from 'react';
import type { Slide } from '@/lib/schema';

/** Swipeable mock of the Instagram carousel. */
export default function InstaPreview({ slides, previews, caption }: { slides: Slide[]; previews: Record<string, string>; caption: string }) {
  const [active, setActive] = useState(0);
  const [more, setMore] = useState(false);
  const short = caption.length > 125 && !more;
  return (
    <div className="insta">
      <div className="insta-head">
        <img src="/api/asset/brand/kreislogo-hauptversion.png" alt="" />
        pflegeunion
      </div>
      <div
        className="insta-track"
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {slides.map((s) => (
          <div key={s.id}>{previews[s.id] && <img src={previews[s.id]} alt="" />}</div>
        ))}
      </div>
      <div className="insta-dots">
        {slides.map((s, i) => <span key={s.id} className={i === active ? 'on' : ''} />)}
      </div>
      <div className="insta-cap">
        <b>pflegeunion</b> {short ? caption.slice(0, 125) : caption}
        {short && <button className="btn small" style={{ padding: '0 6px', background: 'none', color: 'var(--grau60)' }} onClick={() => setMore(true)}>… mehr</button>}
      </div>
    </div>
  );
}
