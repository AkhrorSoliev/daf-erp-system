import type { Phrase } from './unit-inhalt.types';
import {
  phraseAudioSchluessel,
  phraseCodesOf,
  phraseTextHash,
  validatePhraseAudio,
} from './phrase-audio';

const phrase = (funktion: string, de: string, section = 'u01-s1'): Phrase => ({
  section,
  funktion,
  funktionUz: 'x',
  de,
  uz: 'x',
});

describe('phraseCodesOf', () => {
  it('counts inside section + function, not over the whole array', () => {
    const codes = phraseCodesOf([
      phrase('begruessen', 'Guten Tag!'),
      phrase('vorstellen', 'Ich bin Anna.'),
      phrase('begruessen', 'Hallo!'),
      phrase('begruessen', 'Hallo!', 'u01-s2'),
    ]);
    expect(codes).toEqual([
      'u01-s1-begruessen-1',
      'u01-s1-vorstellen-1',
      'u01-s1-begruessen-2',
      'u01-s2-begruessen-1',
    ]);
  });
});

describe('phraseAudioSchluessel', () => {
  const p = phrase('begruessen', 'Guten Tag!');
  const code = 'u01-s1-begruessen-1';

  it('gives the key only when the text is the one the audio was made from', () => {
    const m = {
      [code]: { key: 'daf/audio/a.mp3', textHash: phraseTextHash(p) },
    };
    expect(phraseAudioSchluessel(m, code, p)).toBe('daf/audio/a.mp3');
    expect(
      phraseAudioSchluessel(m, code, phrase('begruessen', 'Guten Abend!')),
    ).toBeNull();
    expect(phraseAudioSchluessel({}, code, p)).toBeNull();
  });
});

describe('validatePhraseAudio', () => {
  it('flags a phrase whose text changed after its audio was made', () => {
    const p = phrase('begruessen', 'Guten Tag!');
    const alt = phrase('begruessen', 'Guten Morgen!');
    const manifest = {
      'u01-s1-begruessen-1': {
        key: 'daf/audio/a.mp3',
        textHash: phraseTextHash(alt),
      },
    };
    expect(validatePhraseAudio([p], manifest)).toEqual([
      expect.stringContaining('u01-s1-begruessen-1'),
    ]);
    expect(validatePhraseAudio([alt], manifest)).toEqual([]);
  });

  it('ignores manifest entries of other units', () => {
    expect(
      validatePhraseAudio([phrase('begruessen', 'Guten Tag!')], {
        'u09-s1-x-1': { key: 'k', textHash: 'h' },
      }),
    ).toEqual([]);
  });
});
