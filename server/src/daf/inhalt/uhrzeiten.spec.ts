import { readFileSync } from 'fs';
import { join } from 'path';
import {
  uhrAudioSchluessel,
  uhrTextHash,
  uhrzeitenDesUnits,
  validateUhrzeiten,
  type UhrzeitenFile,
} from './uhrzeiten';

describe('validateUhrzeiten', () => {
  it('accepts clock face times in five-minute steps', () => {
    expect(
      validateUhrzeiten({ 'u05-s1': [{ zeit: '03:30' }, { zeit: '12:55' }] }),
    ).toEqual([]);
  });

  it('names every broken entry', () => {
    const fehler = validateUhrzeiten({
      'u05-s1': [
        { zeit: '15:30' },
        { zeit: '00:00' },
        { zeit: '03:07' },
        { zeit: '3:30' },
        { zeit: '04:00' },
        { zeit: '04:00' },
      ],
      bolim: [{ zeit: '03:30' }],
    });
    expect(fehler).toHaveLength(6);
    expect(fehler.join('\n')).toMatch(/15:30/);
    expect(fehler.join('\n')).toMatch(/03:07/);
    expect(fehler.join('\n')).toMatch(/takror/);
    expect(fehler.join('\n')).toMatch(/bolim/);
  });
});

describe('uhrzeitenDesUnits', () => {
  it('takes only the given unit`s sections', () => {
    const file: UhrzeitenFile = {
      'u05-s1': [{ zeit: '03:30' }],
      'u05-s4': [{ zeit: '08:00' }],
      'u06-s1': [{ zeit: '09:00' }],
    };
    expect(uhrzeitenDesUnits(file, 'u05')).toEqual({
      'u05-s1': ['03:30'],
      'u05-s4': ['08:00'],
    });
  });
});

describe('uhr audio manifest', () => {
  it('hashes what is spoken, so a changed wording drops the old file', () => {
    expect(uhrTextHash('03:30')).toMatch(/^[0-9a-f]{16}$/);
    expect(uhrTextHash('03:30')).not.toBe(uhrTextHash('04:30'));
  });

  it('gives the key only for a recording of the current text', () => {
    const manifest = {
      '03:30': { key: 'daf/audio/a.mp3', textHash: uhrTextHash('03:30') },
      '04:30': { key: 'daf/audio/b.mp3', textHash: 'alt' },
    };
    expect(uhrAudioSchluessel(manifest, '03:30')).toBe('daf/audio/a.mp3');
    expect(uhrAudioSchluessel(manifest, '04:30')).toBeNull();
    expect(uhrAudioSchluessel(manifest, '05:30')).toBeNull();
  });
});

describe('content/daf/a1/uhrzeiten.json', () => {
  const a1 = join(__dirname, '..', '..', '..', 'content', 'daf', 'a1');
  const file = JSON.parse(
    readFileSync(join(a1, 'uhrzeiten.json'), 'utf8'),
  ) as UhrzeitenFile;

  it('is valid', () => {
    expect(validateUhrzeiten(file)).toEqual([]);
  });

  it('u05-s1 covers every kind of time A1 teaches', () => {
    const minuten = new Set(file['u05-s1'].map((z) => z.zeit.slice(3)));
    for (const m of [
      '00',
      '05',
      '10',
      '15',
      '20',
      '25',
      '30',
      '35',
      '40',
      '45',
      '50',
      '55',
    ]) {
      expect(minuten).toContain(m);
    }
  });
});
