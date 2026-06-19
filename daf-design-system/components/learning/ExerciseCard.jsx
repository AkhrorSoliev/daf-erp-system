import React from 'react';
import { FractionChip } from '../gamification/FractionChip.jsx';

/**
 * Exercise card — the "Homework Compulsory" rows. A green TYPE pill + an amber
 * SKILL pill, the instruction text, star/coin fraction chips, and a thin
 * progress bar with a trailing percent.
 */
export function ExerciseCard({
  type = 'Choose Answer', skill = 'GRAMMAR', instruction, stars = [0, 10], coins = [0, 10],
  percent = 0, onClick, style = {},
}) {
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'block', padding: 18,
      background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-card)',
      cursor: onClick ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent', ...style }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ height: 30, padding: '0 14px', borderRadius: 'var(--r-pill)', background: 'var(--success-500)', color: '#fff',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center' }}>{type}</span>
          <span style={{ height: 28, padding: '0 14px', borderRadius: 'var(--r-pill)', background: 'var(--amber-500)', color: 'var(--ink-900)',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12.5, letterSpacing: '.04em', display: 'inline-flex', alignItems: 'center' }}>{skill}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end', flex: '0 0 auto' }}>
          <FractionChip kind="star" earned={stars[0]} total={stars[1]} size="sm" />
          <FractionChip kind="coin" earned={coins[0]} total={coins[1]} size="sm" />
        </div>
      </div>
      <div style={{ margin: '14px 0 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
        color: 'var(--ink-900)', lineHeight: 1.3 }}>{instruction}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 10, background: 'var(--amber-50)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', background: 'var(--amber-500)', borderRadius: 'var(--r-pill)' }} />
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--amber-600)', minWidth: 38, textAlign: 'right' }}>{percent}%</span>
      </div>
    </button>
  );
}
