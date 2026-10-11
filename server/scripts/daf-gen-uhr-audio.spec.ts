import { readFileSync } from 'fs';
import { join } from 'path';
import { uhrTextHash, type UhrzeitenFile } from '../src/daf/inhalt/uhrzeiten';
import {
  UHR_BELGI_CHEGARASI,
  alleZeiten,
  gesamtZeichen,
  manifestMitZeit,
  preisUsd,
  pruefeUhrBudget,
  uhrSprechtext,
  zuGenerierenZeiten,
} from './daf-gen-uhr-audio';

// Importing the script runs nothing: its `main()` is behind
// `require.main === module`, so no fal.ai call and no R2 write happen here.

describe('alleZeiten', () => {
  const file: UhrzeitenFile = {
    'u05-s1': [{ zeit: '03:30' }, { zeit: '07:15' }],
    'u05-s4': [{ zeit: '03:30' }, { zeit: '08:00' }],
    'u06-s1': [{ zeit: '09:00' }],
  };

  it('takes each time once — one recording serves every section', () => {
    expect(alleZeiten(file)).toEqual(['03:30', '07:15', '08:00', '09:00']);
  });

  it('narrows to one unit', () => {
    expect(alleZeiten(file, 'u05')).toEqual(['03:30', '07:15', '08:00']);
  });
});

describe('uhrSprechtext', () => {
  it('says the taught informal form in a sentence', () => {
    expect(uhrSprechtext('03:30')).toBe('Es ist halb vier.');
    expect(uhrSprechtext('12:30')).toBe('Es ist halb eins.');
  });
});

describe('zuGenerierenZeiten', () => {
  it('takes times missing from the manifest or with a stale hash', () => {
    const manifest = {
      '03:30': { key: 'daf/audio/a.mp3', textHash: uhrTextHash('03:30') },
      '07:15': { key: 'daf/audio/b.mp3', textHash: 'alt' },
    };
    expect(zuGenerierenZeiten(['03:30', '07:15', '08:00'], manifest)).toEqual([
      '07:15',
      '08:00',
    ]);
  });
});

describe('manifestMitZeit', () => {
  it('records the key with the hash of what was spoken', () => {
    const vorher = { '09:00': { key: 'daf/audio/z.mp3', textHash: 'h' } };
    const nachher = manifestMitZeit(vorher, '03:30', 'daf/audio/n.mp3');
    expect(nachher).toEqual({
      '09:00': { key: 'daf/audio/z.mp3', textHash: 'h' },
      '03:30': { key: 'daf/audio/n.mp3', textHash: uhrTextHash('03:30') },
    });
    expect(vorher).not.toHaveProperty('03:30');
  });
});

describe('budget', () => {
  it('stops above the limit, passes at it', () => {
    expect(() => pruefeUhrBudget(UHR_BELGI_CHEGARASI + 1)).toThrow(
      String(UHR_BELGI_CHEGARASI),
    );
    expect(() => pruefeUhrBudget(UHR_BELGI_CHEGARASI)).not.toThrow();
  });

  it('is $0.01 per 1000 characters', () => {
    expect(preisUsd(1000)).toBeCloseTo(0.01);
  });

  it('the whole content file fits in one run', () => {
    const file = JSON.parse(
      readFileSync(
        join(__dirname, '..', 'content', 'daf', 'a1', 'uhrzeiten.json'),
        'utf8',
      ),
    ) as UhrzeitenFile;
    const zeichen = gesamtZeichen(alleZeiten(file));
    expect(zeichen).toBeGreaterThan(0);
    expect(() => pruefeUhrBudget(zeichen)).not.toThrow();
  });
});
