import React from 'react';
import { Avatar } from '../core/Avatar.jsx';

/** Conversation list row — avatar, name, last-message preview, time, unread badge. */
export function ConversationRow({ name, preview, time, unread = 0, src, online = false, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px',
      background: '#fff', border: '1px solid var(--line)', borderRadius: 22, boxShadow: 'var(--shadow-xs)', cursor: 'pointer',
      textAlign: 'left', WebkitTapHighlightColor: 'transparent', ...style }}>
      <span style={{ position: 'relative', flex: '0 0 auto' }}>
        <Avatar name={name} src={src} size={50} />
        {online ? <span style={{ position: 'absolute', right: 1, bottom: 1, width: 13, height: 13, borderRadius: '50%',
          background: 'var(--success-500)', border: '2px solid #fff' }} /> : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink-900)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12, color: 'var(--ink-400)', flex: '0 0 auto' }}>{time}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: unread ? 700 : 600, fontSize: 14,
            color: unread ? 'var(--ink-700)' : 'var(--ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</span>
          {unread ? (
            <span style={{ flex: '0 0 auto', minWidth: 22, height: 22, padding: '0 7px', borderRadius: 'var(--r-pill)',
              background: 'var(--coral-500)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
