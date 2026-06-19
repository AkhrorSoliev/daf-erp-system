import React from 'react';

/** Segmented control — pill track with a sliding selected segment. */
export function SegmentedControl({ options = [], value, onChange, style = {}, ...rest }) {
  const idx = Math.max(0, options.findIndex((o) => (o.value ?? o) === value));
  const n = options.length || 1;
  return (
    <div style={{
      position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`,
      padding: 5, background: 'var(--bg-sunk)', borderRadius: 'var(--r-pill)',
      boxShadow: 'var(--inset-soft)', ...style,
    }} {...rest}>
      <span style={{
        position: 'absolute', top: 5, bottom: 5, left: `calc(${(idx * 100) / n}% + 5px)`,
        width: `calc(${100 / n}% - 10px)`, background: '#fff', borderRadius: 'var(--r-pill)',
        boxShadow: 'var(--shadow-sm)', transition: 'left var(--dur-base) var(--ease-out)',
      }} />
      {options.map((o) => {
        const val = o.value ?? o; const label = o.label ?? o;
        const active = val === value;
        return (
          <button key={String(val)} onClick={() => onChange && onChange(val)}
            style={{ position: 'relative', zIndex: 1, height: 38, border: 'none', background: 'transparent',
              fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: 14,
              color: active ? 'var(--coral-600)' : 'var(--ink-500)', cursor: 'pointer',
              transition: 'color var(--dur-base)', WebkitTapHighlightColor: 'transparent' }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
