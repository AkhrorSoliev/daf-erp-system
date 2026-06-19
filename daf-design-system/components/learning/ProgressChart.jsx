import React, { useState } from 'react';

/**
 * Progress line chart — the "Mening lug‘atim" stats. Range tabs (7 kun / 1 oy /
 * 6 oy / 1 yil), a lightweight SVG line/area chart with a dashed grid + x labels,
 * and an optional legend. Pure SVG, no chart lib. Pass one or two series.
 */
export function ProgressChart({
  ranges = ['7 kun', '1 oy', '6 oy', '1 yil'], range, onRange,
  labels = ['Shan', 'Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju'],
  series = [], legend = [], height = 200, style = {},
}) {
  const [r, setR] = useState(range || ranges[0]);
  const setRange = (v) => { setR(v); onRange && onRange(v); };
  const cur = range || r;

  const W = 320, H = height, padL = 26, padB = 26, padT = 10, padR = 8;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const n = labels.length;
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, n - 1);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const path = (data) => data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <div style={{ background: 'var(--bg-tint)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', padding: 16, ...style }}>
      {/* Range tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 5, background: '#fff', borderRadius: 'var(--r-pill)', boxShadow: 'var(--inset-soft)', marginBottom: 16 }}>
        {ranges.map((rg) => {
          const active = rg === cur;
          return (
            <button key={rg} onClick={() => setRange(rg)} style={{ flex: 1, height: 34, border: 'none', borderRadius: 'var(--r-pill)',
              background: active ? 'var(--coral-50)' : 'transparent', color: active ? 'var(--coral-600)' : 'var(--ink-500)',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: active ? 'var(--shadow-xs)' : 'none' }}>{rg}</button>
          );
        })}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {/* horizontal grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + g * (H - padT - padB)} y2={padT + g * (H - padT - padB)}
            stroke="var(--line)" strokeWidth="1" strokeDasharray="4 5" />
        ))}
        {/* y axis */}
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="var(--ink-800)" strokeWidth="2" />
        {/* series */}
        {series.map((s, si) => (
          <g key={si}>
            <path d={path(s.data)} fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 4px 6px rgba(14,42,61,.12))' }} />
            {s.data.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2.5" />)}
          </g>
        ))}
        {/* x labels */}
        {labels.map((l, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontFamily="var(--font-ui)" fontWeight="700" fontSize="11" fill="var(--ink-400)">{l}</text>
        ))}
      </svg>

      {legend.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          {legend.map((lg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--ink-700)', minWidth: 24 }}>{lg.value}</span>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: lg.color, flex: '0 0 auto' }} />
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink-600)' }}>{lg.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
