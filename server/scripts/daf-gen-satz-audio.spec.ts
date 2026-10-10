import { readFileSync } from 'fs';
import type { SaetzeFile, Satz } from '../src/daf/inhalt/unit-inhalt.types';
import { satzTextHash } from '../src/daf/inhalt/satz-audio';
import { gesamtZeichenzahl } from './daf-gen-audio';
import {
  SATZ_BELGI_CHEGARASI,
  manifestMitSatz,
  preisUsd,
  pruefeSatzBudget,
  saetzePfad,
  zuGenerierenSaetze,
} from './daf-gen-satz-audio';

// Importing the script runs nothing: its `main()` is behind
// `require.main === module`, so no fal.ai call and no R2 write happen here.

const satz = (sourceId: string, de: string): Satz => ({
  sourceId,
  section: 'u04-s1',
  de,
  uz: 'x',
  wordCount: de.split(' ').length,
  origin: 'GENERATED',
});

describe('pruefeSatzBudget', () => {
  it('the limit is exactly 5000 characters', () => {
    expect(SATZ_BELGI_CHEGARASI).toBe(5000);
  });

  it('stops above the limit, passes at it', () => {
    expect(() => pruefeSatzBudget(5001)).toThrow(/5000/);
    expect(() => pruefeSatzBudget(5000)).not.toThrow();
  });

  it('unit 4 fits: 149 sentences, 3 863 characters', () => {
    const u04 = JSON.parse(
      readFileSync(saetzePfad('u04'), 'utf8'),
    ) as SaetzeFile;
    const zeichen = gesamtZeichenzahl(u04.saetze);
    expect(u04.saetze).toHaveLength(149);
    expect(zeichen).toBe(3863);
    expect(() => pruefeSatzBudget(zeichen)).not.toThrow();
  });
});

describe('preisUsd', () => {
  it('is $0.01 per 1000 characters', () => {
    expect(preisUsd(1000)).toBeCloseTo(0.01);
    expect(preisUsd(3863)).toBeCloseTo(0.03863);
  });
});

describe('zuGenerierenSaetze', () => {
  it('takes sentences missing from the manifest or with a stale hash', () => {
    const neu = satz('u04-s1-01', 'Ich trinke Kaffee.');
    const frisch = satz('u04-s1-02', 'Ich esse Brot.');
    const alt = satz('u04-s1-03', 'Ich trinke Tee.');
    const manifest = {
      [frisch.sourceId]: {
        key: 'daf/audio/a.mp3',
        textHash: satzTextHash(frisch),
      },
      [alt.sourceId]: {
        key: 'daf/audio/b.mp3',
        textHash: satzTextHash(satz('u04-s1-03', 'Ich trinke Wasser.')),
      },
    };
    expect(
      zuGenerierenSaetze([neu, frisch, alt], manifest).map((s) => s.sourceId),
    ).toEqual(['u04-s1-01', 'u04-s1-03']);
  });
});

describe('manifestMitSatz', () => {
  it('records the key with the hash of the text it was made from', () => {
    const vorher = { 'u04-s1-09': { key: 'daf/audio/z.mp3', textHash: 'h' } };
    const s = satz('u04-s1-01', 'Ich trinke Kaffee.');
    const nachher = manifestMitSatz(vorher, s, 'daf/audio/n.mp3');
    expect(nachher).toEqual({
      'u04-s1-09': { key: 'daf/audio/z.mp3', textHash: 'h' },
      'u04-s1-01': { key: 'daf/audio/n.mp3', textHash: satzTextHash(s) },
    });
    expect(vorher).not.toHaveProperty('u04-s1-01');
  });
});

describe('saetzePfad', () => {
  it('points at the unit sentence file', () => {
    expect(saetzePfad('u04')).toMatch(/content\/daf\/a1\/u04\/saetze\.json$/);
  });
});
