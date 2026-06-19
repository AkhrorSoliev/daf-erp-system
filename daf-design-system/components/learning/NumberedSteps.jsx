import React from 'react';

/**
 * Numbered steps path — the "Sizda hali so‘zlar yo‘q" empty-state onboarding.
 * Chunky clay numbered tiles alternate left/right and are joined by a CONTINUOUS
 * dashed connector: it drops straight down from each tile, turns, and runs across
 * into the next tile, so the sequence reads as one flowing path. Each tile is
 * paired with an explanatory bubble.
 */
export function NumberedSteps({ steps = [], tone = 'grape', style = {} }) {
  const tones = {
    grape: ['var(--grape-400)', 'var(--grape-600)'],
    coral: ['var(--coral-400)', 'var(--coral-700)'],
    teal:  ['var(--teal-400)', 'var(--teal-700)'],
    sky:   ['var(--sky-400)', 'var(--sky-600)'],
  };
  const [face, lip] = tones[tone] || tones.grape;

  const TILE = 78, OFF = 2, CENTER = OFF + TILE / 2; // 41px from the near edge
  const BLOCK = 132, LAST = 84;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
      {steps.map((s, i) => {
        const left = i % 2 === 0;        // tile side this row
        const last = i === steps.length - 1;
        return (
          <div key={i} style={{ position: 'relative', height: last ? LAST : BLOCK }}>
            {/* Continuous dashed connector to the next tile (down + across) */}
            {!last ? (
              <span aria-hidden="true" style={{
                position: 'absolute', top: OFF + TILE, height: BLOCK - TILE, left: CENTER, right: CENTER,
                borderBottom: `3px dashed ${face}`,
                borderLeft: left ? `3px dashed ${face}` : 'none',
                borderRight: left ? 'none' : `3px dashed ${face}`,
                borderBottomLeftRadius: left ? 18 : 0,
                borderBottomRightRadius: left ? 0 : 18,
                opacity: 0.7,
              }} />
            ) : null}

            {/* Numbered clay tile */}
            <span style={{
              position: 'absolute', top: OFF, left: left ? OFF : 'auto', right: left ? 'auto' : OFF,
              width: TILE, height: TILE, borderRadius: 'var(--r-xl)', background: face, color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)',
              fontWeight: 800, fontSize: 32, boxShadow: `0 6px 0 ${lip}, 0 12px 20px rgba(14,42,61,.14)`, zIndex: 1,
            }}>{i + 1}</span>

            {/* Explanatory bubble, vertically centered on the tile */}
            <span style={{
              position: 'absolute', top: OFF + TILE / 2, transform: 'translateY(-50%)',
              left: left ? OFF + TILE + 16 : OFF, right: left ? OFF : OFF + TILE + 16,
              background: 'var(--bg-tint)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
              padding: '14px 16px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink-700)',
              lineHeight: 1.4,
            }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}
