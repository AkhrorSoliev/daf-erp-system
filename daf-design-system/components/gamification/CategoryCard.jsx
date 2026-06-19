import React from 'react';

/**
 * Category count card — the soft pastel rows from "Mening lug‘atim" (Learning /
 * New / All words) and the "Unit 1.1" sections (Video / Vocabulary / Homework).
 * Big rounded title on a tinted surface with a trailing value box (count or %).
 */
export function CategoryCard({ title, value, tone = 'sky', onClick, style = {} }) {
  const tones = {
    sky:    ['var(--sky-100)', 'var(--ink-900)'],
    pink:   ['#FCE0EE', 'var(--ink-900)'],
    sand:   ['#F4E7CB', 'var(--ink-900)'],
    grape:  ['var(--grape-100)', 'var(--ink-900)'],
    mint:   ['#CFF3D8', 'var(--ink-900)'],
    peach:  ['#FFE3C2', 'var(--ink-900)'],
    coral:  ['var(--coral-50)', 'var(--ink-900)'],
    teal:   ['var(--teal-50)', 'var(--ink-900)'],
  };
  const [bg, fg] = tones[tone] || tones.sky;
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '20px 18px', textAlign: 'left',
      background: bg, border: 'none', borderRadius: 'var(--r-xl)', cursor: onClick ? 'pointer' : 'default',
      boxShadow: 'var(--shadow-sm)', WebkitTapHighlightColor: 'transparent', ...style,
    }}>
      <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 23, color: fg, lineHeight: 1.15 }}>{title}</span>
      <span style={{ flex: '0 0 auto', minWidth: 60, height: 56, padding: '0 14px', borderRadius: 'var(--r-md)',
        background: 'rgba(255,255,255,.72)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink-900)' }}>{value}</span>
    </button>
  );
}
