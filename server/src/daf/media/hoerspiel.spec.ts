import {
  FERN_FILTER,
  geraeuschId,
  hoerspielHash,
  mischFfmpegArgs,
  mischPlan,
  parseStille,
  pruefeHoerspiel,
  sprachStuecke,
  teileZeilen,
  type HoerspielRegie,
} from './hoerspiel';

describe('parseStille', () => {
  it('pairs silence starts and ends from ffmpeg output', () => {
    const stderr = [
      '[silencedetect @ 0x1] silence_start: 1.21',
      '[silencedetect @ 0x1] silence_end: 1.58 | silence_duration: 0.37',
      '[silencedetect @ 0x1] silence_start: 2.4',
      '[silencedetect @ 0x1] silence_end: 2.75 | silence_duration: 0.35',
    ].join('\n');
    expect(parseStille(stderr)).toEqual([
      { start: 1.21, ende: 1.58 },
      { start: 2.4, ende: 2.75 },
    ]);
  });
});

describe('sprachStuecke', () => {
  it('returns the speech between silences and drops tiny bursts', () => {
    expect(
      sprachStuecke(
        [
          { start: 0, ende: 0.29 },
          { start: 0.92, ende: 1.63 },
          { start: 2.16, ende: 2.2 },
          { start: 2.25, ende: 3.0 },
        ],
        4,
      ),
    ).toEqual([
      { start: 0.29, ende: 0.92 },
      { start: 1.63, ende: 2.16 },
      { start: 3.0, ende: 4 },
    ]);
  });
});

describe('teileZeilen', () => {
  const s = (text: string, start: number, ende: number) => ({
    text,
    start,
    ende,
  });

  it('groups pieces into lines and cuts in the gap between two lines', () => {
    const cuts = teileZeilen(
      ['Hallo Mia!', 'Hm... Käse, Butter... aber kein Brot!', 'Kein Brot?'],
      [
        s('Hallo Mia!', 0.3, 1.2),
        s('Käse, Butter.', 1.6, 2.8),
        s('Aber kein Brot.', 3.4, 4.5),
        s('Kein Brot?', 5.0, 5.8),
      ],
    );
    expect(cuts).toEqual([1.4, 4.75]);
  });

  it('two lines that say the same words are still told apart (u04-d3)', () => {
    const cuts = teileZeilen(
      ['Guten Tag!', 'Guten Tag! Was kostet die Melone?'],
      [
        s('Guten Tag.', 0.29, 0.92),
        s('Guten Tag.', 1.63, 2.16),
        s('Was kostet die Melone?', 3.0, 4.6),
      ],
    );
    expect(cuts).toEqual([1.275]);
  });

  it('a one-word line heard wrong keeps its place (u03-d2 «Gankke»)', () => {
    const cuts = teileZeilen(
      ['Es ist klein.', 'Danke!', 'Bitte!'],
      [
        s('Es ist klein.', 0.1, 0.9),
        s('Gankke!', 1.3, 1.7),
        s('Bitte!', 2.1, 2.5),
      ],
    );
    expect(cuts).toEqual([1.1, 1.9]);
  });

  it('refuses when there are fewer pieces than lines', () => {
    expect(() =>
      teileZeilen(['Hallo!', 'Tschüss!'], [s('Hallo Tschüss', 0, 1)]),
    ).toThrow(/bo'lak/);
  });

  it('refuses when a longer line matches no word at all', () => {
    expect(() =>
      teileZeilen(
        ['Hallo Mia!', 'Wie geht es dir?'],
        [s('Hallo Mia!', 0, 1), s('Ganz anders hier', 1.5, 2.5)],
      ),
    ).toThrow(/2-satr/);
  });
});

// CEO 2026-10-11: the 3.8 voices are a little fast; slow the recording
// locally (pitch kept) rather than asking the model to speak slower.
describe('pruefeHoerspiel — tempo', () => {
  it('accepts a tempo from 0.8 to 1', () => {
    expect(pruefeHoerspiel({ tempo: 0.9 }, 4)).toEqual([]);
    expect(pruefeHoerspiel({ tempo: 1 }, 4)).toEqual([]);
  });

  it('refuses a tempo outside 0.8–1', () => {
    expect(pruefeHoerspiel({ tempo: 0.5 }, 4)).toEqual(['tempo 0.5 (0.8–1)']);
    expect(pruefeHoerspiel({ tempo: 1.2 }, 4)).toEqual(['tempo 1.2 (0.8–1)']);
  });

  it('a new tempo changes the mix hash, so the dialog is remixed', () => {
    expect(hoerspielHash({ tempo: 0.9 })).not.toBe(hoerspielHash({}));
  });
});

describe('pruefeHoerspiel', () => {
  it('accepts a valid plan', () => {
    const h: HoerspielRegie = {
      atmo: { sfx: 'quiet kitchen room tone', sek: 15 },
      geraeusche: [{ vor: 2, sfx: 'a fridge door opening', sek: 3 }],
      fern: [1, 3],
    };
    expect(pruefeHoerspiel(h, 4)).toEqual([]);
  });

  it('names every mistake', () => {
    const h: HoerspielRegie = {
      geraeusche: [
        { vor: 0, sfx: 'door', sek: 3 },
        { vor: 6, sfx: '', sek: 30 },
      ],
      fern: [5],
    };
    expect(pruefeHoerspiel(h, 4)).toHaveLength(5);
  });
});

describe('hashes', () => {
  it('a sound is keyed by what is asked for', () => {
    expect(geraeuschId({ sfx: 'door', sek: 3 })).toBe(
      geraeuschId({ sfx: 'door', sek: 3 }),
    );
    expect(geraeuschId({ sfx: 'door', sek: 3 })).not.toBe(
      geraeuschId({ sfx: 'door', sek: 3, loop: true }),
    );
  });

  it('the mix hash changes with any direction', () => {
    const a: HoerspielRegie = { fern: [1] };
    expect(hoerspielHash(a)).not.toBe(hoerspielHash({ fern: [2] }));
  });
});

describe('mischPlan', () => {
  const h: HoerspielRegie = {
    atmo: { sfx: 'kitchen', sek: 15 },
    geraeusche: [
      { vor: 1, sfx: 'steps', sek: 2 },
      { vor: 3, sfx: 'door', sek: 3, lautstaerke: 0.5 },
    ],
    fern: [2],
  };
  const dauer = new Map([
    [geraeuschId({ sfx: 'steps', sek: 2 }), 2],
    [geraeuschId({ sfx: 'door', sek: 3 }), 3],
  ]);

  it('lays effects and lines one after another, the far line filtered', () => {
    const plan = mischPlan({
      dauer: 4,
      schnitte: [1.4, 2.55],
      regie: h,
      geraeuschDauer: dauer,
    });
    const roh = plan.clips.filter((c) => c.quelle === 'roh');
    expect(roh.map((c) => [c.von, c.bis])).toEqual([
      [0, 1.4],
      [1.4, 2.55],
      [2.55, 4],
    ]);
    expect(roh.map((c) => c.fern)).toEqual([false, true, false]);
    const steps = plan.clips.find((c) => c.quelle !== 'roh' && c.at < 1)!;
    expect(steps.at).toBeCloseTo(0.7); // after the lead-in silence
    expect(roh[0].at).toBeCloseTo(0.7 + 2 + 0.2);
    const door = plan.clips.find((c) => c.lautstaerke === 0.5)!;
    expect(door.at).toBeCloseTo(roh[1].at + 1.15);
    expect(roh[2].at).toBeCloseTo(door.at + 3 + 0.2);
    expect(plan.gesamt).toBeCloseTo(roh[2].at + 1.45 + 1);
    expect(plan.atmo).toEqual({
      id: geraeuschId({ sfx: 'kitchen', sek: 15, loop: true }),
      lautstaerke: 0.12,
    });
  });

  it('a plan without effects is the dialog with the usual padding', () => {
    const plan = mischPlan({
      dauer: 4,
      schnitte: [1.4, 2.55],
      regie: {},
      geraeuschDauer: new Map(),
    });
    expect(plan.clips.map((c) => c.at)).toEqual([0.7, 2.1, 3.25]);
    expect(plan.atmo).toBeNull();
  });
});

describe('mischFfmpegArgs', () => {
  it('trims each clip, filters the far line and mixes over the loop', () => {
    const plan = mischPlan({
      dauer: 4,
      schnitte: [1.4, 2.55],
      regie: { atmo: { sfx: 'kitchen', sek: 15 }, fern: [2] },
      geraeuschDauer: new Map(),
    });
    const args = mischFfmpegArgs(plan, {
      roh: '/t/roh.mp3',
      geraeusche: new Map([
        [geraeuschId({ sfx: 'kitchen', sek: 15, loop: true }), '/t/k.mp3'],
      ]),
      ausgabe: '/t/out.mp3',
    });
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(args).toContain('-stream_loop');
    expect(fc).toContain('atrim=start=1.4:end=2.55');
    expect(fc).toContain(FERN_FILTER);
    expect(fc).toContain('amix=inputs=4:normalize=0');
    expect(fc).toContain('loudnorm');
    expect(args[args.length - 1]).toBe('/t/out.mp3');
  });
});

describe('stimmfilter (radio, karnay, telefon)', () => {
  it('faqat ma`lum filtrlarni qabul qiladi', () => {
    expect(pruefeHoerspiel({ stimmfilter: 'funk' }, 4)).toEqual([]);
    expect(pruefeHoerspiel({ stimmfilter: 'karnay' }, 4)).toEqual([]);
    expect(pruefeHoerspiel({ stimmfilter: 'telefon' }, 4)).toEqual([]);
    expect(pruefeHoerspiel({ stimmfilter: 'yomon' as never }, 4)).toHaveLength(
      1,
    );
  });

  it('har ovoz bo`lagi filtrdan o`tadi, effekt o`tmaydi, aralashma xeshi o`zgaradi', () => {
    const h: HoerspielRegie = {
      stimmfilter: 'funk',
      geraeusche: [{ vor: 1, sfx: 'jingle', sek: 3 }],
    };
    const plan = mischPlan({
      dauer: 6,
      schnitte: [3],
      regie: h,
      geraeuschDauer: new Map([[geraeuschId({ sfx: 'jingle', sek: 3 }), 3]]),
    });
    const roh = plan.clips.filter((c) => c.quelle === 'roh');
    expect(roh).toHaveLength(2);
    expect(roh.every((c) => c.filter?.includes('highpass'))).toBe(true);
    expect(plan.clips.find((c) => c.quelle !== 'roh')?.filter).toBeUndefined();
    expect(hoerspielHash(h)).not.toBe(
      hoerspielHash({ geraeusche: h.geraeusche }),
    );
  });
});
