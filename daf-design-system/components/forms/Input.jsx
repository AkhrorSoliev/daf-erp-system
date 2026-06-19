import React, { useState } from 'react';

/** Text input — rounded, roomy, with optional leading icon and label. */
export function Input({
  label, placeholder, value, defaultValue, type = 'text', iconBefore = null,
  error = '', disabled = false, onChange, style = {}, ...rest
}) {
  const [focus, setFocus] = useState(false);
  const borderColor = error ? 'var(--danger-500)' : focus ? 'var(--coral-500)' : 'var(--line-strong)';
  return (
    <label style={{ display: 'block', ...style }}>
      {label ? (
        <span style={{ display: 'block', marginBottom: 8, fontFamily: 'var(--font-ui)',
          fontWeight: 'var(--fw-bold)', fontSize: 14, color: 'var(--ink-700)' }}>{label}</span>
      ) : null}
      <span style={{
        display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: '0 16px',
        background: disabled ? 'var(--bg-sunk)' : '#fff', border: `2px solid ${borderColor}`,
        borderRadius: 'var(--r-md)', boxShadow: focus ? 'var(--ring)' : 'none',
        transition: 'border-color var(--dur-base), box-shadow var(--dur-base)',
      }}>
        {iconBefore ? <span style={{ display: 'inline-flex', fontSize: 20, color: 'var(--ink-400)' }}>{iconBefore}</span> : null}
        <input type={type} placeholder={placeholder} value={value} defaultValue={defaultValue}
          disabled={disabled} onChange={onChange}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'var(--font-ui)', fontWeight: 'var(--fw-semibold)', fontSize: 16,
            color: 'var(--ink-900)', minWidth: 0 }} {...rest} />
      </span>
      {error ? (
        <span style={{ display: 'block', marginTop: 6, fontFamily: 'var(--font-ui)',
          fontWeight: 'var(--fw-semibold)', fontSize: 13, color: 'var(--danger-500)' }}>{error}</span>
      ) : null}
    </label>
  );
}
