import React from 'react';

/**
 * Large gradient feature tile — the bold home/resource cards. Big rounded title,
 * an "open" arrow chip, an optional art slot on the right, and a clay lip.
 */
export function FeatureCard({
  title, subtitle, gradient = 'warm', art = null, onClick, height = 150, style = {}, ...rest
}) {
  const grads = {
    warm: 'var(--grad-warm)', sun: 'var(--grad-sun)', teal: 'var(--grad-teal)',
    cool: 'var(--grad-cool)', grape: 'var(--grad-grape)',
  };
  const lips = {
    warm: 'var(--clay-coral)', sun: 'var(--clay-amber)', teal: 'var(--clay-teal)',
    cool: 'var(--clay-sky)', grape: 'var(--clay-grape)',
  };
  return (
    <div onClick={onClick} style={{
      position: 'relative', overflow: 'hidden', minHeight: height, padding: 22,
      background: grads[gradient] || grads.warm, borderRadius: 'var(--r-xl)',
      boxShadow: lips[gradient] || lips.warm, cursor: onClick ? 'pointer' : 'default',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      transition: 'transform var(--dur-base) var(--ease-out)', ...style,
    }}
      onMouseDown={(e) => onClick && (e.currentTarget.style.transform = 'translateY(3px)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
      {...rest}>
      {art ? (
        <div style={{ position: 'absolute', right: -6, bottom: -6, top: 0, width: '46%',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', opacity: 0.95,
          fontSize: 96, color: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }}>{art}</div>
      ) : null}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: art ? '62%' : '100%' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-extra)', fontSize: 30,
          lineHeight: 1.05, color: '#fff', letterSpacing: 'var(--ls-tight)',
          textShadow: '0 2px 8px rgba(14,42,61,.18)' }}>{title}</div>
        {subtitle ? (
          <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', height: 44,
            padding: '0 18px', borderRadius: 'var(--r-pill)', background: 'rgba(255,255,255,0.22)',
            color: '#fff', fontFamily: 'var(--font-ui)', fontWeight: 'var(--fw-bold)', fontSize: 15,
            backdropFilter: 'blur(4px)' }}>{subtitle}</div>
        ) : null}
      </div>
      <span style={{ position: 'absolute', top: 16, right: 16, width: 46, height: 46, borderRadius: '50%',
        background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ink-900)', fontSize: 22, boxShadow: 'var(--shadow-card)' }}>
        <i className="ph-bold ph-arrow-up-right" />
      </span>
    </div>
  );
}
