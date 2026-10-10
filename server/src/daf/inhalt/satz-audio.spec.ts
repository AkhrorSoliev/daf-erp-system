import { createHash } from 'crypto';
import {
  satzAudioSchluessel,
  satzTextHash,
  validateSatzAudio,
} from './satz-audio';
import type { Satz } from './unit-inhalt.types';

const satz = (de = 'Ich trinke Kaffee.', tts?: string): Satz => ({
  sourceId: 'u04-s1-01',
  section: 'u04-s1',
  de,
  uz: 'Men kofe ichaman.',
  wordCount: 3,
  origin: 'GENERATED',
  ...(tts ? { tts } : {}),
});

describe('satzTextHash', () => {
  it('is the first 16 hex of sha256 of the German sentence', () => {
    const erwartet = createHash('sha256')
      .update('Ich trinke Kaffee.', 'utf8')
      .digest('hex')
      .slice(0, 16);
    expect(satzTextHash(satz())).toBe(erwartet);
  });

  it('changes when the German or the spoken text changes, not the Uzbek', () => {
    const a = satzTextHash(satz());
    expect(satzTextHash(satz('Ich trinke Tee.'))).not.toBe(a);
    expect(
      satzTextHash(satz('Ich trinke Kaffee.', 'Ich trinke Kafe.')),
    ).not.toBe(a);
    const boshqaUz: Satz = { ...satz(), uz: 'boshqa' };
    expect(satzTextHash(boshqaUz)).toBe(a);
  });
});

describe('satzAudioSchluessel', () => {
  it('gives the key while the text is the one the audio was made from', () => {
    const m = {
      'u04-s1-01': { key: 'daf/audio/a.mp3', textHash: satzTextHash(satz()) },
    };
    expect(satzAudioSchluessel(m, satz())).toBe('daf/audio/a.mp3');
  });

  it('gives null for a stale entry or no entry', () => {
    const m = {
      'u04-s1-01': { key: 'daf/audio/a.mp3', textHash: satzTextHash(satz()) },
    };
    expect(satzAudioSchluessel(m, satz('Ich trinke Tee.'))).toBeNull();
    expect(satzAudioSchluessel({}, satz())).toBeNull();
  });
});

describe('validateSatzAudio', () => {
  it('no entry is not a problem (audio not made yet)', () => {
    expect(validateSatzAudio([satz()], {})).toEqual([]);
  });

  it('reports a sentence edited after its audio was made', () => {
    const m = {
      'u04-s1-01': { key: 'daf/audio/a.mp3', textHash: satzTextHash(satz()) },
    };
    expect(validateSatzAudio([satz()], m)).toEqual([]);
    const probleme = validateSatzAudio([satz('Ich trinke Tee.')], m);
    expect(probleme).toHaveLength(1);
    expect(probleme[0]).toContain('u04-s1-01');
  });
});
