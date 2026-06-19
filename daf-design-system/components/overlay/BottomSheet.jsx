import React from 'react';

/**
 * Lumio BottomSheet — slides up from the bottom over a scrim. Has the grab
 * handle, an optional title, and arbitrary content (action lists, pickers).
 */
export function BottomSheet({ open = true, onClose, title, children, style = {} }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
      style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end',
        background: 'rgba(14,42,61,.48)', animation: 'lumio-fade-in var(--dur-base) var(--ease-out) both' }}>
      <div style={{ width: '100%', background: '#fff', borderTopLeftRadius: 'var(--r-3xl)', borderTopRightRadius: 'var(--r-3xl)',
        padding: '12px 20px calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -10px 40px rgba(14,42,61,.22)',
        animation: 'lumio-sheet-up var(--dur-slow) var(--ease-out) both', ...style }}>
        <div style={{ width: 44, height: 5, borderRadius: 'var(--r-pill)', background: 'var(--ink-200)', margin: '0 auto 14px' }} />
        {title ? (
          <h2 style={{ margin: '0 0 14px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 21, color: 'var(--ink-900)' }}>{title}</h2>
        ) : null}
        {children}
      </div>
      <style>{`@keyframes lumio-sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}

/** Convenience row for a BottomSheet action list. */
export function SheetAction({ icon, label, tone = 'ink', onClick }) {
  const tones = {
    ink: 'var(--ink-800)', coral: 'var(--coral-600)', teal: 'var(--teal-600)',
    grape: 'var(--grape-600)', danger: 'var(--danger-500)',
  };
  const c = tones[tone] || tones.ink;
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 14px',
      border: 'none', background: 'transparent', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: c, WebkitTapHighlightColor: 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tint)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      {icon ? <span style={{ display: 'inline-flex', fontSize: 22, color: c }}>{icon}</span> : null}
      {label}
    </button>
  );
}
