import React from 'react';

/**
 * Battle-result stat capsule (icon + value). Used in the "Jang natijasi" cards:
 * correct (teal), wrong (danger), star (amber), time (neutral). `filled` for the winner.
 */
export function ResultStatPill({ icon, value, kind = 'correct', filled = false, style = {} }) {
  const map = {
    correct: ['var(--success-500)', 'var(--success-50)', 'var(--success-600)'],
    wrong:   ['var(--danger-500)', 'var(--danger-50)', 'var(--danger-600)'],
    star:    ['var(--amber-500)', 'var(--amber-50)', 'var(--amber-700)'],
    time:    ['var(--sky-500)', 'var(--sky-100)', 'var(--sky-600)'],
  };
  const [solid, tint, deep] = map[kind] || map.correct;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 6px 0 6px',
      borderRadius: 'var(--r-pill)', background: filled ? 'rgba(255,255,255,.22)' : '#fff',
      boxShadow: filled ? 'none' : 'var(--shadow-xs)', ...style }}>
      <span style={{ width: 24, height: 24, borderRadius: '50%', background: solid, color: '#fff', fontSize: 14,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, lineHeight: 1, paddingRight: 8,
        color: filled ? '#fff' : 'var(--ink-900)' }}>{value}</span>
    </span>
  );
}
