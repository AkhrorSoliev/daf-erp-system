import React from 'react';
import { FractionChip } from '../gamification/FractionChip.jsx';
import { Button } from '../core/Button.jsx';

/**
 * Video lesson card — the "1-video / 2-video" blocks. Title, a "Video" and a
 * "Mashq" (practice) row each with star/coin fractions + a track bar, and a
 * watch CTA. Clay-extruded white card.
 */
export function VideoLessonCard({
  title = '1-video', video = { stars: [0, 1], coins: [0, 1], pct: 0 },
  practice = { stars: [0, 10], coins: [0, 10], pct: 0 }, onWatch, style = {},
}) {
  const Row = ({ label, data }) => (
    <div style={{ background: 'var(--bg-tint)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--ink-900)' }}>{label}:</span>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <FractionChip kind="star" earned={data.stars[0]} total={data.stars[1]} size="sm" />
          <FractionChip kind="coin" earned={data.coins[0]} total={data.coins[1]} size="sm" />
        </span>
      </div>
      <div style={{ height: 12, background: '#fff', borderRadius: 'var(--r-pill)', boxShadow: 'var(--inset-soft)', overflow: 'hidden' }}>
        <div style={{ width: `${data.pct}%`, height: '100%', background: 'var(--teal-500)', borderRadius: 'var(--r-pill)' }} />
      </div>
    </div>
  );
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--r-xl)', padding: 18, boxShadow: 'var(--clay-white)', ...style }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink-900)', marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <Row label="Video" data={video} />
        <Row label="Mashq" data={practice} />
      </div>
      <Button variant="primary" block size="lg" onClick={onWatch} iconAfter={<i className="ph-fill ph-play" />}>Videoni ko‘rish</Button>
    </div>
  );
}
