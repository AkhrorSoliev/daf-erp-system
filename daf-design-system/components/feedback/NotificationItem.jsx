import React from 'react';

/**
 * Notification row covering the full state matrix:
 *  - unread  → faint coral-tinted surface, coral dot, bolder title
 *  - read    → flat/transparent, muted title, no dot
 *  - isNew   → coral "Yangi" pill (just-received, on top of unread)
 *  - priority→ amber accent bar + tinted surface + warning emphasis ("Muhim")
 * Type sets the icon-tile color (achievement/battle/social/lesson/system).
 */
export function NotificationItem({
  type = 'system', icon, title, body, time, read = false, isNew = false, priority = false, onClick, style = {},
}) {
  const tones = {
    achievement: ['var(--amber-50)', 'var(--amber-600)'],
    battle:      ['var(--coral-50)', 'var(--coral-600)'],
    social:      ['var(--grape-100)', 'var(--grape-600)'],
    lesson:      ['var(--teal-50)', 'var(--teal-600)'],
    system:      ['var(--ink-100)', 'var(--ink-600)'],
  };
  const [tile, fg] = tones[type] || tones.system;

  // Surface: priority > unread > read
  const surface = priority ? 'var(--amber-50)' : read ? 'transparent' : 'var(--coral-50)';
  const borderCol = priority ? 'var(--amber-300)' : read ? 'var(--line)' : 'var(--coral-100)';

  return (
    <button onClick={onClick} style={{
      position: 'relative', width: '100%', display: 'flex', alignItems: 'flex-start', gap: 13,
      padding: '14px 16px 14px', paddingLeft: priority ? 16 : 16, textAlign: 'left',
      background: surface, border: `1px solid ${borderCol}`, borderRadius: 'var(--r-lg)',
      boxShadow: read ? 'none' : 'var(--shadow-xs)', cursor: 'pointer', overflow: 'hidden',
      WebkitTapHighlightColor: 'transparent', ...style,
    }}>
      {priority ? (
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: 'var(--amber-500)' }} />
      ) : null}

      <span style={{ flex: '0 0 auto', width: 44, height: 44, borderRadius: 'var(--r-md)', background: tile, color: fg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 23, marginLeft: priority ? 4 : 0 }}>
        {icon}
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: read ? 600 : 800, fontSize: 16,
            color: read ? 'var(--ink-600)' : 'var(--ink-900)', lineHeight: 1.2 }}>{title}</span>
          {priority ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 20, padding: '0 8px', borderRadius: 'var(--r-pill)',
              background: 'var(--amber-500)', color: 'var(--ink-900)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 10.5, letterSpacing: '.03em' }}>
              <i className="ph-fill ph-warning" style={{ fontSize: 12 }} />MUHIM
            </span>
          ) : isNew ? (
            <span style={{ height: 20, padding: '0 8px', borderRadius: 'var(--r-pill)', background: 'var(--coral-500)', color: '#fff',
              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 10.5, letterSpacing: '.03em', display: 'inline-flex', alignItems: 'center' }}>YANGI</span>
          ) : null}
        </span>
        {body ? (
          <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13.5,
            color: read ? 'var(--ink-400)' : 'var(--ink-600)', lineHeight: 1.4 }}>{body}</span>
        ) : null}
        {time ? (
          <span style={{ display: 'block', marginTop: 6, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 11.5, color: 'var(--ink-400)' }}>{time}</span>
        ) : null}
      </span>

      {!read ? (
        <span style={{ flex: '0 0 auto', width: 10, height: 10, borderRadius: '50%', marginTop: 6,
          background: priority ? 'var(--amber-500)' : 'var(--coral-500)' }} />
      ) : null}
    </button>
  );
}
