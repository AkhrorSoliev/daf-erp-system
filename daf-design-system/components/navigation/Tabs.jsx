import React from 'react';

/**
 * Scrollable category tabs (e.g. Starter / Beginner / Elementary). Selected tab is
 * a solid pill; works on both light surfaces and colored headers (`onColor`).
 */
export function Tabs({ items = [], value, onChange, onColor = false, style = {} }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 2px 6px', WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none', ...style }}>
      {items.map((it) => {
        const val = it.value ?? it; const label = it.label ?? it;
        const active = val === value;
        const activeBg = onColor ? '#fff' : 'var(--coral-500)';
        const activeFg = onColor ? 'var(--ink-900)' : '#fff';
        const idleFg = onColor ? 'rgba(255,255,255,.85)' : 'var(--ink-500)';
        return (
          <button key={String(val)} onClick={() => onChange && onChange(val)}
            style={{ flex: '0 0 auto', height: 40, padding: '0 18px', border: 'none', borderRadius: 'var(--r-pill)',
              background: active ? activeBg : (onColor ? 'transparent' : '#fff'),
              boxShadow: active ? 'var(--shadow-sm)' : (onColor ? 'none' : 'inset 0 0 0 1px var(--line)'),
              color: active ? activeFg : idleFg, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all var(--dur-base) var(--ease-out)',
              WebkitTapHighlightColor: 'transparent' }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
