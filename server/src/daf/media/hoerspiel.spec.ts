import {
  FERN_FILTER,
  geraeuschId,
  hoerspielHash,
  mischFfmpegArgs,
  mischPlan,
  parseStille,
  pruefeHoerspiel,
  schnitte,
  whisperWoerter,
  zeilenSpannen,
  type HoerspielRegie,
} from './hoerspiel';

const w = (text: string, from: number, to: number) => ({ text, from, to });

describe('whisperWoerter', () => {
  it('reads word segments in seconds and drops empty ones', () => {
    const json = {
      transcription: [
        { offsets: { from: 0, to: 980 }, text: '' },
        { offsets: { from: 980, to: 1340 }, text: ' Markus,' },
        { offsets: { from: 1340, to: 1940 }, text: ' gibt' },
      ],
    };
    expect(whisperWoerter(json)).toEqual([
      w('Markus,', 0.98, 1.34),
      w('gibt', 1.34, 1.94),
    ]);
  });
});

describe('zeilenSpannen', () => {
  const zeilen = ['Hallo Mia!', 'Kein Brot?', 'Nein, kein Brot.'];

  it('finds where each line starts and ends', () => {
    const woerter = [
      w('Hallo', 0.5, 0.8),
      w('Mia!', 0.8, 1.2),
      w('Kein', 1.6, 1.9),
      w('Brot?', 1.9, 2.3),
      w('Nein,', 2.8, 3.1),
      w('kein', 3.1, 3.4),
      w('Brot.', 3.4, 3.9),
    ];
    expect(zeilenSpannen(zeilen, woerter)).toEqual([
      { start: 0.5, ende: 1.2 },
      { start: 1.6, ende: 2.3 },
      { start: 2.8, ende: 3.9 },
    ]);
  });

  it('survives a misheard and an extra word', () => {
    const woerter = [
      w('Halo', 0.5, 0.8),
      w('Mia', 0.8, 1.2),
      w('äh', 1.3, 1.4),
      w('Kein', 1.6, 1.9),
      w('Brot', 1.9, 2.3),
      w('Nein', 2.8, 3.1),
      w('kein', 3.1, 3.4),
      w('Brot', 3.4, 3.9),
    ];
    const s = zeilenSpannen(zeilen, woerter);
    expect(s[1]).toEqual({ start: 1.6, ende: 2.3 });
    expect(s[2]).toEqual({ start: 2.8, ende: 3.9 });
  });

  it('a one-word line heard wrong still gets its place (u03-d2 "Gankke")', () => {
    const s = zeilenSpannen(
      ['Es ist klein.', 'Danke!', 'Bitte!'],
      [
        w('Es', 0.1, 0.3),
        w('ist', 0.3, 0.5),
        w('klein.', 0.5, 0.9),
        w('Gankke!', 1.3, 1.7),
        w('Bitte!', 2.1, 2.5),
      ],
    );
    expect(s[1]).toEqual({ start: 1.3, ende: 1.7 });
  });

  it('refuses when a line was not heard at all', () => {
    const woerter = [w('Hallo', 0.5, 0.8), w('Mia', 0.8, 1.2)];
    expect(() => zeilenSpannen(zeilen, woerter)).toThrow(/2-satr/);
  });
});

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

describe('schnitte', () => {
  const spannen = [
    { start: 0.5, ende: 1.2 },
    { start: 1.6, ende: 2.3 },
    { start: 2.8, ende: 3.9 },
  ];

  it('cuts in the middle of the silence between two lines', () => {
    const stille = [
      { start: 0.9, ende: 1.0 }, // a pause inside line 1
      { start: 1.22, ende: 1.58 },
      { start: 2.32, ende: 2.78 },
    ];
    expect(schnitte(spannen, stille)).toEqual([1.4, 2.55]);
  });

  it('falls back to the gap between the words when no silence is near', () => {
    expect(schnitte(spannen, [])).toEqual([1.4, 2.55]);
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
