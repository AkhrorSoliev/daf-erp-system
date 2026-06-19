import React from 'react';

/**
 * Bottom tab bar — floating pill. The active tab becomes a solid coral circle;
 * inactive tabs show icon + label in muted ink.
 */
export function BottomNav({ items = [], value, onChange, style = {}, ...rest }) {
  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
      height: 'var(--nav-h)', padding: '0 14px', background: 'rgba(255,255,255,0.82)',
      backdropFilter: 'var(--blur-glass)', WebkitBackdropFilter: 'var(--blur-glass)',
      borderRadius: 'var(--r-2xl)', boxShadow: '0 -2px 30px rgba(14,42,61,.12), 0 8px 24px rgba(14,42,61,.10)',
      border: '1px solid rgba(255,255,255,0.6)', ...style,
    }} {...rest}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button key={it.value} onClick={() => onChange && onChange(it.value)}
            aria-label={it.label} style={{
              flex: active ? '0 0 auto' : 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, height: active ? 56 : '100%', width: active ? 56 : 'auto',
              padding: 0, border: 'none', borderRadius: active ? '50%' : 'var(--r-md)',
              background: active ? 'var(--coral-500)' : 'transparent',
              boxShadow: active ? '0 8px 18px rgba(255,107,74,.40)' : 'none',
              color: active ? '#fff' : 'var(--ink-400)', cursor: 'pointer',
              transition: 'all var(--dur-base) var(--ease-out)', WebkitTapHighlightColor: 'transparent',
            }}>
            <span style={{ fontSize: active ? 24 : 22, display: 'inline-flex' }}>
              {active ? (it.iconActive || it.icon) : it.icon}
            </span>
            {!active ? (
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 'var(--fw-bold)', fontSize: 12,
                color: 'var(--ink-400)' }}>{it.label}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
