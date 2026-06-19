import React from 'react';

/** Small status/label pill. Solid or soft fill across the brand palette. */
export function Badge({ children, color = 'coral', soft = true, size = 'md', style = {}, ...rest }) {
  const map = {
    coral:   ['var(--coral-500)', 'var(--coral-50)', 'var(--coral-700)'],
    amber:   ['var(--amber-500)', 'var(--amber-50)', 'var(--amber-700)'],
    teal:    ['var(--teal-500)', 'var(--teal-50)', 'var(--teal-700)'],
    grape:   ['var(--grape-500)', 'var(--grape-100)', 'var(--grape-600)'],
    sky:     ['var(--sky-500)', 'var(--sky-100)', 'var(--sky-600)'],
    success: ['var(--success-500)', 'var(--success-50)', 'var(--success-600)'],
    danger:  ['var(--danger-500)', 'var(--danger-50)', 'var(--danger-600)'],
    neutral: ['var(--ink-500)', 'var(--ink-100)', 'var(--ink-700)'],
  };
  const [solid, tint, deep] = map[color] || map.coral;
  const sizes = { sm: { fs: 11, py: 3, px: 8 }, md: { fs: 12, py: 4, px: 10 }, lg: { fs: 14, py: 6, px: 14 } };
  const s = sizes[size] || sizes.md;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-ui)',
      fontWeight: 'var(--fw-extra)', fontSize: s.fs, lineHeight: 1, letterSpacing: 'var(--ls-wide)',
      padding: `${s.py}px ${s.px}px`, borderRadius: 'var(--r-pill)',
      color: soft ? deep : '#fff', background: soft ? tint : solid, ...style,
    }} {...rest}>{children}</span>
  );
}
