import React from 'react';

/**
 * Chat message bubble. `me` = coral, right-aligned; `them` = white, left-aligned.
 * Optional sender name (group chats) and timestamp.
 */
export function MessageBubble({ children, side = 'them', name, time, tail = true, style = {} }) {
  const me = side === 'me';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start',
      maxWidth: '78%', alignSelf: me ? 'flex-end' : 'flex-start', ...style }}>
      {name && !me ? (
        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12, color: 'var(--grape-600)',
          margin: '0 0 3px 14px' }}>{name}</span>
      ) : null}
      <div style={{
        padding: '11px 15px', background: me ? 'var(--coral-500)' : '#fff', color: me ? '#fff' : 'var(--ink-900)',
        fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15.5, lineHeight: 1.4,
        borderRadius: 20, borderBottomRightRadius: me && tail ? 6 : 20, borderBottomLeftRadius: !me && tail ? 6 : 20,
        boxShadow: me ? '0 4px 12px rgba(255,107,74,.28)' : 'var(--shadow-sm)',
        border: me ? 'none' : '1px solid var(--line)', wordBreak: 'break-word',
      }}>
        {children}
      </div>
      {time ? (
        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 11, color: 'var(--ink-400)',
          margin: me ? '4px 6px 0 0' : '4px 0 0 6px' }}>{time}</span>
      ) : null}
    </div>
  );
}
