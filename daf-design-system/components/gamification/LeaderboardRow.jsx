import React from 'react';
import { Avatar } from '../core/Avatar.jsx';

/**
 * Leaderboard row — rank, avatar, name, and a star-XP pill. `highlight` outlines
 * the current user's own row (the "Peshqadamlar jadvali" self-row).
 */
export function LeaderboardRow({ rank, name, xp, src, highlight = false, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      background: '#fff', borderRadius: 'var(--r-lg)', cursor: onClick ? 'pointer' : 'default', textAlign: 'left',
      border: highlight ? '2px solid var(--coral-500)' : '1px solid var(--line)',
      boxShadow: highlight ? '0 8px 20px rgba(255,107,74,.18)' : 'var(--shadow-xs)',
      WebkitTapHighlightColor: 'transparent', ...style }}>
      <span style={{ width: 26, textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17,
        color: rank <= 3 ? 'var(--coral-500)' : 'var(--ink-500)', flex: '0 0 auto' }}>{rank}</span>
      <Avatar name={name} src={src} size={42} />
      <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16.5, color: 'var(--ink-900)',
        lineHeight: 1.15 }}>{name}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', flex: '0 0 auto',
        background: 'var(--surface-tint)', border: '1px solid var(--line)', borderRadius: 'var(--r-pill)' }}>
        <i className="ph-fill ph-star" style={{ color: 'var(--amber-500)', fontSize: 17 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--ink-900)' }}>{xp}</span>
      </span>
    </button>
  );
}
