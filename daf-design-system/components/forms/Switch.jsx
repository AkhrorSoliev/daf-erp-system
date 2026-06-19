import React from 'react';

/** Toggle switch — green when on (matches the settings "Ovoz effektlari" toggle). */
export function Switch({ checked = false, disabled = false, onChange, size = 'md', style = {}, ...rest }) {
  const dims = { sm: { w: 44, h: 26, k: 20 }, md: { w: 54, h: 32, k: 26 } };
  const d = dims[size] || dims.md;
  const pad = (d.h - d.k) / 2;
  return (
    <button role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!checked)}
      style={{
        position: 'relative', width: d.w, height: d.h, flex: '0 0 auto', padding: 0, border: 'none',
        borderRadius: 'var(--r-pill)', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--success-500)' : 'var(--ink-300)', opacity: disabled ? 0.5 : 1,
        boxShadow: 'var(--inset-soft)', transition: 'background var(--dur-base) var(--ease-out)',
        WebkitTapHighlightColor: 'transparent', ...style,
      }} {...rest}>
      <span style={{
        position: 'absolute', top: pad, left: checked ? d.w - d.k - pad : pad, width: d.k, height: d.k,
        borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(14,42,61,.25)',
        transition: 'left var(--dur-base) var(--ease-bounce)',
      }} />
    </button>
  );
}
