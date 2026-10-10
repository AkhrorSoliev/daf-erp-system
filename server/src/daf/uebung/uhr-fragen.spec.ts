import { BadRequestException } from '@nestjs/common';
import type { MaterialUhrzeit } from './frage.types';
import {
  istUhrFormat,
  uhrAblenker,
  uhrHoeren,
  uhrHoerenAntwort,
  uhrLesen,
  uhrTippen,
} from './uhr-fragen';
import { gleicheUhr, informell, parseZeit } from './uhrzeit-text';

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

const uhr = (
  zeit: string,
  audioKey: string | null = null,
): MaterialUhrzeit => ({
  id: 7,
  zeit,
  sectionCode: 'u05-s1',
  audioKey,
});

const mediaUrl = (key: string) => `https://cdn.test/${key}`;

const ALLE: string[] = [];
for (let h = 1; h <= 12; h += 1) {
  for (let m = 0; m < 60; m += 5) {
    ALLE.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

describe('uhrAblenker', () => {
  it.each(ALLE)('%s — three other times, none the same clock face', (z) => {
    const ziel = parseZeit(z)!;
    for (let seed = 1; seed <= 5; seed += 1) {
      const falsch = uhrAblenker(ziel, seeded(seed));
      expect(falsch).toHaveLength(3);
      const alle = [ziel, ...falsch];
      for (let i = 0; i < alle.length; i += 1) {
        expect(alle[i].m % 5).toBe(0);
        expect(alle[i].h).toBeGreaterThanOrEqual(1);
        expect(alle[i].h).toBeLessThanOrEqual(12);
        for (let j = i + 1; j < alle.length; j += 1) {
          expect(gleicheUhr(alle[i], alle[j])).toBe(false);
        }
      }
    }
  });
});

describe('uhrLesen', () => {
  it('shows the clock, four German times, the taught form is right', () => {
    const f = uhrLesen(uhr('03:30'), seeded(1))!;
    expect(f.format).toBe('UHR_LESEN');
    expect(f.itemType).toBe('UHRZEIT');
    expect(f.itemId).toBe(7);
    expect(f.uhrzeit).toBe('03:30');
    expect(f.prompt).toBe('');
    expect(f.richtig).toBe('halb vier');
    expect(f.options).toHaveLength(4);
    expect(f.options).toContain('halb vier');
    expect(f.belegteItems).toEqual(['UHRZEIT:7']);
    expect(f.audioUrl).toBeNull();
  });

  it.each(ALLE)(
    '%s — no option but the answer is a correct form of the time',
    (z) => {
      const { h, m } = parseZeit(z)!;
      const richtigeFormen = new Set(informell(h, m));
      for (let seed = 1; seed <= 3; seed += 1) {
        const f = uhrLesen(uhr(z), seeded(seed))!;
        expect(new Set(f.options).size).toBe(4);
        expect(f.options.filter((o) => richtigeFormen.has(o))).toEqual([
          f.richtig,
        ]);
      }
    },
  );

  it('builds nothing from a broken or 24-hour time', () => {
    expect(uhrLesen(uhr('3:30'), seeded(1))).toBeNull();
    expect(uhrLesen(uhr('15:30'), seeded(1))).toBeNull();
    expect(uhrLesen(uhr('03:07'), seeded(1))).toBeNull();
  });
});

describe('uhrHoeren', () => {
  it('plays the time, four clocks to pick from, the time itself hidden', () => {
    const f = uhrHoeren(uhr('03:30', 'daf/audio/x.mp3'), seeded(2), mediaUrl)!;
    expect(f.format).toBe('UHR_HOEREN');
    expect(f.audioUrl).toBe('https://cdn.test/daf/audio/x.mp3');
    expect(f.uhrzeit ?? null).toBeNull();
    expect(f.prompt).toBe('');
    expect(f.richtig).toBe('03:30');
    expect(f.options).toHaveLength(4);
    expect(f.options).toContain('03:30');
    const zeiten = f.options.map((o) => parseZeit(o)!);
    expect(zeiten.filter((z) => gleicheUhr(z, { h: 3, m: 30 }))).toHaveLength(
      1,
    );
  });

  it('is not built without audio, or without a public R2 URL', () => {
    expect(uhrHoeren(uhr('03:30'), seeded(1), mediaUrl)).toBeNull();
    expect(
      uhrHoeren(uhr('03:30', 'daf/audio/x.mp3'), seeded(1), () => null),
    ).toBeNull();
  });
});

describe('uhrTippen', () => {
  it('shows the clock; no options; the taught form is the answer', () => {
    const f = uhrTippen(uhr('09:45'))!;
    expect(f.format).toBe('UHR_TIPPEN');
    expect(f.uhrzeit).toBe('09:45');
    expect(f.options).toEqual([]);
    expect(f.richtig).toBe('Viertel vor zehn');
  });
});

describe('uhrHoerenAntwort', () => {
  it('the picked clock is compared with the time; the words come after', () => {
    expect(uhrHoerenAntwort('03:30', '03:30')).toEqual({
      isCorrect: true,
      richtig: '03:30',
      loesungWort: 'halb vier',
    });
    expect(uhrHoerenAntwort('03:30', '04:30').isCorrect).toBe(false);
    expect(uhrHoerenAntwort('03:30', '').isCorrect).toBe(false);
  });

  it('refuses a broken stored time', () => {
    expect(() => uhrHoerenAntwort('3:30', '03:30')).toThrow(
      BadRequestException,
    );
  });
});

describe('istUhrFormat', () => {
  it('names the three clock formats only', () => {
    expect(istUhrFormat('UHR_LESEN')).toBe(true);
    expect(istUhrFormat('UHR_HOEREN')).toBe(true);
    expect(istUhrFormat('UHR_TIPPEN')).toBe(true);
    expect(istUhrFormat('WORT_TIPPEN')).toBe(false);
  });
});
