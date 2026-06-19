import React from 'react';

/**
 * Lesson path node — the chunky rounded unit tile from the lesson map.
 * States: locked (greyed, sunk), active (coral glow ring), done (teal).
 */
export function LessonNode({ label = 'Unit 1.1', percent = 0, state = 'locked', size = 132, onClick, style = {}, ...rest }) {
  const states = {
    locked: { face: 'var(--bg-sunk)', ring: 'transparent', text: 'var(--ink-400)', lip: '#D2DAE3' },
    active: { face: '#fff', ring: 'var(--coral-500)', text: 'var(--ink-900)', lip: '#E2E8EF' },
    done:   { face: 'var(--teal-50)', ring: 'var(--teal-500)', text: 'var(--teal-700)', lip: 'var(--teal-300)' },
  };
  const s = states[state] || states.locked;
  return (
    <button onClick={onClick} style={{
      position: 'relative', width: size, height: size, padding: 16, border: 'none',
      background: s.face, borderRadius: 'var(--r-2xl)', textAlign: 'left', cursor: 'pointer',
      boxShadow: state === 'active'
        ? `0 0 0 5px ${s.ring}, 0 6px 0 ${s.lip}, 0 16px 26px rgba(255,107,74,.28)`
        : `0 6px 0 ${s.lip}, 0 12px 22px rgba(14,42,61,.10)`,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      transition: 'transform var(--dur-fast) var(--ease-out)', WebkitTapHighlightColor: 'transparent', ...style,
    }}
      onMouseDown={(e) => (e.currentTarget.style.transform = 'translateY(3px)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
      {...rest}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-extra)', fontSize: 26,
        color: s.text, lineHeight: 1 }}>{percent}%</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: 19,
        color: s.text, lineHeight: 1 }}>{label}</span>
      {state === 'locked' ? (
        <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 18, color: 'var(--ink-400)' }}>
          <i className="ph-fill ph-lock-simple" />
        </span>
      ) : null}
    </button>
  );
}
