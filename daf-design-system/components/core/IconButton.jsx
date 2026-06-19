import React from 'react';

/** Circular/squircle icon button — used for nav actions, card "open" arrows, chips. */
export function IconButton({
  children,
  variant = 'soft',
  size = 'md',
  shape = 'circle',
  disabled = false,
  ariaLabel,
  onClick,
  style = {},
  ...rest
}) {
  const sizes = { sm: 36, md: 44, lg: 56 };
  const dim = sizes[size] || sizes.md;

  const palettes = {
    primary: { bg: 'var(--coral-500)', fg: '#fff', shadow: 'var(--shadow-sm)' },
    soft:    { bg: 'var(--ink-100)', fg: 'var(--ink-800)', shadow: 'none' },
    white:   { bg: '#fff', fg: 'var(--ink-900)', shadow: 'var(--shadow-card)' },
    teal:    { bg: 'var(--teal-500)', fg: '#fff', shadow: 'var(--shadow-sm)' },
    ghost:   { bg: 'transparent', fg: 'var(--ink-700)', shadow: 'none' },
  };
  const p = palettes[variant] || palettes.soft;

  return (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: dim, height: dim, fontSize: dim * 0.46, color: p.fg, background: p.bg,
        border: 'none', borderRadius: shape === 'circle' ? '50%' : 'var(--r-md)',
        boxShadow: p.shadow, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'transform var(--dur-fast) var(--ease-out), background var(--dur-base)',
        WebkitTapHighlightColor: 'transparent', flex: '0 0 auto', ...style,
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = 'scale(0.92)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      {...rest}>
      {children}
    </button>
  );
}
