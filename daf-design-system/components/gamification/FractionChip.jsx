import React from 'react';

/**
 * Fraction reward chip — the "star 0/10" / "coin 0/10" pills used all over the
 * lesson screens to show earned-vs-total stars and coins. Outlined capsule with
 * a colored icon coin.
 */
export function FractionChip({ kind = 'star', earned = 0, total = 0, size = 'md', style = {} }) {
  const kinds = {
    star: ['var(--success-500)', <i className="ph-fill ph-star" />],
    coin: ['var(--amber-400)', <i className="ph-fill ph-coin" />],
    xp:   ['var(--amber-500)', <i className="ph-fill ph-lightning" />],
    gem:  ['var(--teal-500)', <i className="ph-fill ph-diamond" />],
  };
  const [c, icon] = kinds[kind] || kinds.star;
  const sz = size === 'sm' ? { h: 28, fs: 13, ic: 16, px: 6 } : { h: 34, fs: 15, ic: 19, px: 7 };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: sz.h, padding: `0 ${sz.px + 4}px 0 ${sz.px}px`,
      background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', boxShadow: 'var(--shadow-xs)', ...style }}>
      <span style={{ display: 'inline-flex', fontSize: sz.ic, color: c }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: sz.fs, color: 'var(--ink-900)', lineHeight: 1 }}>
        {earned}<span style={{ color: 'var(--ink-400)' }}>/{total}</span>
      </span>
    </span>
  );
}
