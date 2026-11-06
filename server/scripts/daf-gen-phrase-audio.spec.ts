import { readFileSync } from 'fs';
import type {
  Phrase,
  RedemittelFile,
} from '../src/daf/inhalt/unit-inhalt.types';
import { phraseTextHash } from '../src/daf/inhalt/phrase-audio';
import { gesamtZeichenzahl } from './daf-gen-audio';
import {
  PHRASE_BELGI_CHEGARASI,
  manifestMitPhrase,
  prueferPhraseBudget,
  redemittelPfad,
  zuGenerierenPhrasen,
} from './daf-gen-phrase-audio';

// Importing the script runs nothing: its `main()` is behind
// `require.main === module`, so no fal.ai call and no R2 write happen here.

const phrase = (funktion: string, de: string): Phrase => ({
  section: 'u06-s1',
  funktion,
  funktionUz: 'x',
  de,
  uz: 'x',
});

describe('prueferPhraseBudget', () => {
  it('stops above the limit, passes at it', () => {
    expect(PHRASE_BELGI_CHEGARASI).toBe(1500);
    expect(() => prueferPhraseBudget(1501)).toThrow(/1500/);
    expect(() => prueferPhraseBudget(1500)).not.toThrow();
  });

  it('unit 6 fits in one run', () => {
    const u06 = JSON.parse(
      readFileSync(redemittelPfad('u06'), 'utf8'),
    ) as RedemittelFile;
    expect(u06.phrasen).toHaveLength(22);
    expect(() =>
      prueferPhraseBudget(gesamtZeichenzahl(u06.phrasen)),
    ).not.toThrow();
  });
});

describe('zuGenerierenPhrasen', () => {
  it('takes phrases missing from the manifest or with a stale hash, under their codes', () => {
    const neu = phrase('fragen', 'Was machst du gern?');
    const frisch = phrase('nennen', 'Mein Hobby ist Tanzen.');
    const alt = phrase('nennen', 'Mein Hobby ist Lesen.');
    const manifest = {
      'u06-s1-nennen-1': {
        key: 'daf/audio/a.mp3',
        textHash: phraseTextHash(frisch),
      },
      'u06-s1-nennen-2': {
        key: 'daf/audio/b.mp3',
        textHash: phraseTextHash(phrase('nennen', 'Mein Hobby ist Malen.')),
      },
    };
    expect(
      zuGenerierenPhrasen([neu, frisch, alt], manifest).map((j) => j.code),
    ).toEqual(['u06-s1-fragen-1', 'u06-s1-nennen-2']);
  });
});

describe('manifestMitPhrase', () => {
  it('records the key with the hash of the text it was made from', () => {
    const job = {
      code: 'u06-s1-fragen-1',
      phrase: phrase('fragen', 'Was machst du gern?'),
    };
    const vorher = { 'u06-s1-x-1': { key: 'k', textHash: 'h' } };
    const nachher = manifestMitPhrase(vorher, job, 'daf/audio/n.mp3');
    expect(nachher).toEqual({
      'u06-s1-x-1': { key: 'k', textHash: 'h' },
      'u06-s1-fragen-1': {
        key: 'daf/audio/n.mp3',
        textHash: phraseTextHash(job.phrase),
      },
    });
    expect(vorher).not.toHaveProperty('u06-s1-fragen-1');
  });
});
