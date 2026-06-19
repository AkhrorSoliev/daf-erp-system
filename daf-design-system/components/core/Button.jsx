import React from 'react';

/**
 * Lumio Button — chunky, rounded, clay-extruded primary action.
 * Variants: primary (coral), secondary (soft), ghost, amber, teal.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  iconBefore = null,
  iconAfter = null,
  type = 'button',
  onClick,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { h: 40, px: 16, fs: 14, radius: 'var(--r-md)', gap: 8 },
    md: { h: 52, px: 22, fs: 16, radius: 'var(--r-lg)', gap: 10 },
    lg: { h: 60, px: 28, fs: 18, radius: 'var(--r-xl)', gap: 12 },
  };
  const s = sizes[size] || sizes.md;

  const palettes = {
    primary:   { bg: 'var(--coral-500)', fg: '#fff', clay: 'var(--clay-coral)', press: 'var(--clay-coral-press)' },
    amber:     { bg: 'var(--amber-500)', fg: 'var(--ink-900)', clay: 'var(--clay-amber)', press: '0 2px 0 var(--amber-700), 0 6px 12px rgba(245,149,18,.28)' },
    teal:      { bg: 'var(--teal-500)',  fg: '#fff', clay: 'var(--clay-teal)', press: '0 2px 0 var(--teal-700), 0 6px 12px rgba(14,154,144,.28)' },
    secondary: { bg: '#fff', fg: 'var(--ink-900)', clay: 'var(--clay-white)', press: 'var(--clay-neutral-press)', border: '1px solid var(--line)' },
    ghost:     { bg: 'transparent', fg: 'var(--ink-700)', clay: 'none', press: 'none' },
  };
  const p = palettes[variant] || palettes.primary;

  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: s.gap, height: s.h, padding: `0 ${s.px}px`, width: block ? '100%' : 'auto',
    fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: s.fs,
    letterSpacing: 'var(--ls-tight)', lineHeight: 1, color: p.fg, background: p.bg,
    border: p.border || 'none', borderRadius: s.radius, cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: variant === 'ghost' ? 'none' : p.clay,
    transform: 'translateY(0)', transition: 'transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), background var(--dur-base)',
    opacity: disabled ? 0.5 : 1, userSelect: 'none', WebkitTapHighlightColor: 'transparent',
    ...style,
  };

  const down = (e) => { if (disabled || variant === 'ghost') return; e.currentTarget.style.transform = 'translateY(4px)'; e.currentTarget.style.boxShadow = p.press; };
  const up = (e) => { if (disabled || variant === 'ghost') return; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = p.clay; };

  return (
    <button type={type} disabled={disabled} onClick={onClick} style={base}
      onMouseDown={down} onMouseUp={up} onMouseLeave={up} onTouchStart={down} onTouchEnd={up}
      onMouseEnter={(e) => { if (!disabled && variant === 'ghost') e.currentTarget.style.background = 'var(--ink-100)'; }}
      {...rest}>
      {iconBefore ? <span style={{ display: 'inline-flex', fontSize: '1.2em' }}>{iconBefore}</span> : null}
      {children}
      {iconAfter ? <span style={{ display: 'inline-flex', fontSize: '1.2em' }}>{iconAfter}</span> : null}
    </button>
  );
}
