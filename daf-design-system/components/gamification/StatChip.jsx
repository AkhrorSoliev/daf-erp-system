import React from 'react';

/** Gamification stat pill — icon + value in a white rounded capsule (XP, coins, streak). */
export function StatChip({ icon, value, kind = 'xp', size = 'md', style = {}, ...rest }) {
  const tones = {
    xp:     'var(--amber-500)',
    coin:   'var(--amber-400)',
    streak: 'var(--coral-500)',
    gem:    'var(--teal-500)',
    neutral:'var(--ink-500)',
  };
  const iconColor = tones[kind] || tones.xp;
  const sizes = { sm: { h: 32, fs: 14, ic: 16, px: 10 }, md: { h: 40, fs: 17, ic: 20, px: 12 } };
  const s = sizes[size] || sizes.md;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, height: s.h, padding: `0 ${s.px}px`,
      background: '#fff', borderRadius: 'var(--r-pill)', boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--line)', ...style,
    }} {...rest}>
      <span style={{ display: 'inline-flex', fontSize: s.ic, color: iconColor }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-extra)', fontSize: s.fs,
        color: 'var(--ink-900)', lineHeight: 1 }}>{value}</span>
    </span>
  );
}
