import React from 'react';

/**
 * Lumio Card — soft white rounded container. The base surface for everything.
 * `clay` adds the extruded bottom lip; `tone` tints the lip color.
 */
export function Card({
  children,
  clay = false,
  tone = 'neutral',
  pad = 'md',
  radius = 'lg',
  onClick,
  style = {},
  ...rest
}) {
  const pads = { none: 0, sm: 14, md: 20, lg: 24 };
  const radii = { md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-xl)', '2xl': 'var(--r-2xl)' };
  const clays = {
    neutral: 'var(--clay-white)', coral: 'var(--clay-coral)', amber: 'var(--clay-amber)',
    teal: 'var(--clay-teal)', grape: 'var(--clay-grape)', sky: 'var(--clay-sky)',
  };

  return (
    <div onClick={onClick}
      style={{
        background: 'var(--surface-card)', borderRadius: radii[radius] || radii.lg,
        padding: pads[pad] ?? pads.md, boxShadow: clay ? (clays[tone] || clays.neutral) : 'var(--shadow-card)',
        border: clay ? 'none' : '1px solid var(--line)', cursor: onClick ? 'pointer' : 'default',
        transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base)', ...style,
      }}
      {...rest}>
      {children}
    </div>
  );
}
