import React from 'react';

/** Avatar — circular user image with initials fallback + optional ring/badge. */
export function Avatar({ src, name = '', size = 48, ring = false, ringColor = 'var(--coral-500)', badge = null, style = {}, ...rest }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto', ...style }} {...rest}>
      <span style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: src ? 'var(--ink-200)' : 'var(--grape-100)', color: 'var(--grape-600)',
        fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: size * 0.38,
        border: ring ? `3px solid ${ringColor}` : 'none',
        boxShadow: ring ? 'none' : 'inset 0 0 0 1px rgba(14,42,61,.06)',
      }}>
        {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (initials || '?')}
      </span>
      {badge ? (
        <span style={{ position: 'absolute', right: -2, bottom: -2, minWidth: size * 0.34, height: size * 0.34,
          padding: '0 4px', borderRadius: 'var(--r-pill)', background: 'var(--coral-500)', color: '#fff',
          border: '2px solid #fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: size * 0.2 }}>{badge}</span>
      ) : null}
    </span>
  );
}
