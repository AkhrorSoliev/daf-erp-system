import React from 'react';

/**
 * Lumio Dialog — centered modal over a scrim. Pops in with the bounce easing.
 * Variants set the icon medallion + accent: confirm (coral), alert (danger),
 * celebrate (amber). Pass your own buttons via `actions`, or use confirm props.
 */
export function Dialog({
  open = true, onClose, variant = 'confirm', icon, title, children,
  actions, dismissOnScrim = true, style = {},
}) {
  if (!open) return null;
  const accents = {
    confirm:   ['var(--coral-50)', 'var(--coral-500)'],
    alert:     ['var(--danger-50)', 'var(--danger-500)'],
    celebrate: ['var(--amber-50)', 'var(--amber-500)'],
    neutral:   ['var(--ink-100)', 'var(--ink-600)'],
  };
  const [tile, fg] = accents[variant] || accents.confirm;

  return (
    <div role="dialog" aria-modal="true"
      onClick={(e) => { if (dismissOnScrim && e.target === e.currentTarget) onClose && onClose(); }}
      style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'rgba(14,42,61,.48)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        animation: 'lumio-fade-in var(--dur-base) var(--ease-out) both' }}>
      <div className="lumio-pop-in" style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 'var(--r-2xl)',
        padding: '28px 24px 22px', boxShadow: 'var(--shadow-pop)', textAlign: 'center', ...style }}>
        {icon ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64,
            borderRadius: '50%', background: tile, color: fg, fontSize: 32, marginBottom: 16 }}>{icon}</span>
        ) : null}
        {title ? (
          <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--ink-900)' }}>{title}</h2>
        ) : null}
        {children ? (
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-600)' }}>{children}</div>
        ) : null}
        {actions ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
