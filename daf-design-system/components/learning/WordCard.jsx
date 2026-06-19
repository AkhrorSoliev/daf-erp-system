import React from 'react';

/**
 * Word flashcard — the "Mavzuga qaytish" vocab card. A language flag + label,
 * the term with an audio button, IPA pronunciation, and an italic example with
 * a translate toggle. Pair two (EN term + UZ translation) for the full pattern.
 */
export function WordCard({
  flag = '🇬🇧', lang = 'Olmosh', term, ipa, example, audioOnly = false,
  onAudio, onTranslate, style = {},
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 20,
      boxShadow: 'var(--shadow-card)', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: term ? 16 : 0 }}>
        <span style={{ fontSize: 30, lineHeight: 1, borderRadius: 6, overflow: 'hidden' }}>{flag}</span>
        {lang ? <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, color: 'var(--ink-900)' }}>{lang}</span> : null}
      </div>
      {term ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: ipa ? 10 : 0 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--ink-900)' }}>{term}</span>
          {onAudio ? (
            <button aria-label="Tinglash" onClick={onAudio} style={{ border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--sky-500)', fontSize: 26, display: 'inline-flex', padding: 2 }}><i className="ph-fill ph-speaker-high" /></button>
          ) : null}
        </div>
      ) : null}
      {ipa ? (
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 18, color: 'var(--ink-500)', marginBottom: example ? 16 : 0 }}>{ipa}</div>
      ) : null}
      {example ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontStyle: 'italic', fontSize: 19, color: 'var(--ink-800)', lineHeight: 1.35 }}>“{example}”</span>
          {onTranslate ? (
            <button aria-label="Tarjima" onClick={onTranslate} style={{ flex: '0 0 auto', width: 44, height: 44, borderRadius: '50%',
              border: 'none', background: 'var(--grape-100)', color: 'var(--grape-600)', cursor: 'pointer', fontSize: 22,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><i className="ph-bold ph-translate" /></button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
