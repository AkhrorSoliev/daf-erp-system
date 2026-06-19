import React from 'react';

/** Horizontal progress bar — rounded, inset track, rounded fill. */
export function ProgressBar({ value = 0, color = 'var(--coral-500)', height = 12, showLabel = false, style = {}, ...rest }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...style }} {...rest}>
      <div style={{ flex: 1, height, background: 'var(--bg-sunk)', borderRadius: 'var(--r-pill)',
        boxShadow: 'var(--inset-soft)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 'var(--r-pill)',
          transition: 'width var(--dur-slow) var(--ease-out)' }} />
      </div>
      {showLabel ? (
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: 13,
          color: 'var(--ink-700)', minWidth: 38, textAlign: 'right' }}>{Math.round(pct)}%</span>
      ) : null}
    </div>
  );
}
