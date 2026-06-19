import React from 'react';

/**
 * List row — the white rounded "menu" rows from the More screen. Leading icon in
 * a soft tile, label, optional trailing content, chevron by default.
 */
export function ListRow({ icon, iconTone = 'grape', label, trailing = null, chevron = true, onClick, style = {}, ...rest }) {
  const tones = {
    grape: ['var(--grape-100)', 'var(--grape-600)'],
    coral: ['var(--coral-50)', 'var(--coral-600)'],
    amber: ['var(--amber-50)', 'var(--amber-600)'],
    teal:  ['var(--teal-50)', 'var(--teal-600)'],
    ink:   ['var(--ink-100)', 'var(--ink-700)'],
  };
  const [tile, fg] = tones[iconTone] || tones.grape;
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
      background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--shadow-xs)', cursor: 'pointer', textAlign: 'left',
      transition: 'background var(--dur-base)', WebkitTapHighlightColor: 'transparent', ...style,
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tint)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
      {...rest}>
      {icon ? (
        <span style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 'var(--r-sm)', background: tile,
          color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{icon}</span>
      ) : null}
      <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: 18,
        color: 'var(--ink-900)' }}>{label}</span>
      {trailing}
      {chevron ? <i className="ph-bold ph-caret-right" style={{ fontSize: 20, color: 'var(--ink-900)' }} /> : null}
    </button>
  );
}
