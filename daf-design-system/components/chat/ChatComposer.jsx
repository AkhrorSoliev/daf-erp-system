import React, { useState } from 'react';

/** Chat input bar — rounded field + coral send button. Pins to the bottom of a thread. */
export function ChatComposer({ placeholder = 'Xabar yozing…', onSend, attach = true, style = {} }) {
  const [text, setText] = useState('');
  const send = () => { const t = text.trim(); if (!t) return; onSend && onSend(t); setText(''); };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px',
      background: 'rgba(255,255,255,.9)', backdropFilter: 'var(--blur-glass)', WebkitBackdropFilter: 'var(--blur-glass)',
      borderTop: '1px solid var(--line)', ...style }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 8px 0 16px',
        background: 'var(--bg-app)', borderRadius: 26, border: '1px solid var(--line)' }}>
        <input value={text} placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '12px 0',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15.5, color: 'var(--ink-900)', minWidth: 0 }} />
        {attach ? (
          <button aria-label="Biriktirish" style={{ border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--ink-400)', fontSize: 22, display: 'inline-flex', padding: 6 }}>
            <i className="ph-bold ph-paperclip" />
          </button>
        ) : null}
      </div>
      <button aria-label="Yuborish" onClick={send} style={{ flex: '0 0 auto', width: 48, height: 48, borderRadius: '50%',
        border: 'none', background: 'var(--coral-500)', color: '#fff', fontSize: 22, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(255,107,74,.4)',
        WebkitTapHighlightColor: 'transparent' }}
        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(.92)')}
        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
        <i className="ph-fill ph-paper-plane-right" />
      </button>
    </div>
  );
}
