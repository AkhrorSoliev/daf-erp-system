import React from 'react';

/** Selectable/filter chip. Toggles between soft idle and solid selected. */
export function Chip({ children, selected = false, color = 'coral', iconBefore = null, onClick, style = {}, ...rest }) {
  const map = {
    coral: 'var(--coral-500)', amber: 'var(--amber-500)', teal: 'var(--teal-500)',
    grape: 'var(--grape-500)', sky: 'var(--sky-500)', ink: 'var(--ink-800)',
  };
  const accent = map[color] || map.coral;
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px',
      fontFamily: 'var(--font-ui)', fontWeight: 'var(--fw-bold)', fontSize: 14, lineHeight: 1,
      color: selected ? '#fff' : 'var(--ink-700)', background: selected ? accent : '#fff',
      border: selected ? '1px solid transparent' : '1px solid var(--line)',
      borderRadius: 'var(--r-pill)', cursor: 'pointer', whiteSpace: 'nowrap',
      boxShadow: selected ? 'var(--shadow-sm)' : 'none', transition: 'all var(--dur-base) var(--ease-out)',
      WebkitTapHighlightColor: 'transparent', ...style,
    }} {...rest}>
      {iconBefore ? <span style={{ display: 'inline-flex', fontSize: '1.15em' }}>{iconBefore}</span> : null}
      {children}
    </button>
  );
}
