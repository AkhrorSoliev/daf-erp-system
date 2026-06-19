import React, { useState } from 'react';

/**
 * Audio player bar — the listening-exercise scrubber. A draggable-looking track
 * with a thumb, elapsed / total times, a volume icon, play/pause, and a speed
 * toggle (1.0x → 1.25x → 1.5x → 0.75x). Visual; wire `onPlay`/`onSeek` for real audio.
 */
export function AudioPlayer({ elapsed = '00:15', total = '00:00', progress = 18, playing = false, onToggle, style = {} }) {
  const [speed, setSpeed] = useState(1);
  const speeds = [1, 1.25, 1.5, 0.75];
  const cycleSpeed = () => setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length]);
  return (
    <div style={{ background: 'var(--bg-sunk)', borderRadius: 'var(--r-lg)', padding: '16px 18px', ...style }}>
      <div style={{ position: 'relative', height: 8, background: 'var(--ink-200)', borderRadius: 'var(--r-pill)', marginBottom: 8 }}>
        <div style={{ width: `${progress}%`, height: '100%', background: 'var(--ink-800)', borderRadius: 'var(--r-pill)' }} />
        <span style={{ position: 'absolute', top: '50%', left: `${progress}%`, transform: 'translate(-50%,-50%)',
          width: 18, height: 18, borderRadius: '50%', background: 'var(--ink-900)', boxShadow: '0 2px 5px rgba(14,42,61,.3)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: 13, color: 'var(--ink-700)', marginBottom: 10 }}>
        <span>{elapsed}</span><span>{total}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        <button aria-label="Ovoz" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-800)', fontSize: 24, display: 'inline-flex' }}>
          <i className="ph-fill ph-speaker-high" /></button>
        <button aria-label={playing ? 'Pauza' : 'Ijro'} onClick={onToggle} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-800)', fontSize: 28, display: 'inline-flex' }}>
          <i className={`ph-fill ph-${playing ? 'pause' : 'play'}`} /></button>
        <button onClick={cycleSpeed} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-800)',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {speed.toFixed(speed % 1 === 0 ? 1 : 2)}x</button>
      </div>
    </div>
  );
}
