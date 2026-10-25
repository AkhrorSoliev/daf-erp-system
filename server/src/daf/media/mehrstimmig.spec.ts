import {
  EINZEL_STIL,
  teileMehrstimmig,
  zeichenMehrstimmig,
  zusammenFfmpegArgs,
} from './mehrstimmig';
import type { GeminiDialog } from './fal-client';

const anfrage: GeminiDialog = {
  prompt: [
    'Claudia: [polite] Guten Abend!',
    'Julia: [friendly] Danke.',
    'Claudia: Die Suppe ist lecker.',
    'Thomas: [cheerful] Und ich möchte ein Schnitzel.',
    'Claudia: [polite] Gern.',
    'Julia: Zwei Wasser, bitte.',
  ].join('\n'),
  speakers: [
    { speakerId: 'Claudia', voice: 'Erinome' },
    { speakerId: 'Julia', voice: 'Callirrhoe' },
    { speakerId: 'Thomas', voice: 'Iapetus' },
  ],
  styleInstructions: 'Im Restaurant.',
};

describe('zusammenFfmpegArgs', () => {
  it('puts main-take pieces and single lines back in the script order', () => {
    const args = zusammenFfmpegArgs({
      reihenfolge: [{ haupt: 0 }, { einzeln: 1 }, { haupt: 1 }],
      schnitte: [2.5],
      dauer: 5,
      haupt: '/t/h.mp3',
      einzeln: new Map([[1, '/t/e1.mp3']]),
      ausgabe: '/t/o.mp3',
    });
    expect(args.slice(0, 5)).toEqual([
      '-y',
      '-i',
      '/t/h.mp3',
      '-i',
      '/t/e1.mp3',
    ]);
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(fc).toContain('[0:a]atrim=start=0:end=2.5');
    expect(fc).toContain('[1:a]silenceremove');
    expect(fc).toContain('[0:a]atrim=start=2.5:end=5');
    expect(fc).toContain('[p0][p1][p2]concat=n=3:v=0:a=1[out]');
    expect(args[args.length - 1]).toBe('/t/o.mp3');
  });
});

describe('teileMehrstimmig', () => {
  it('voices the two busiest speakers together and the third line by line', () => {
    const t = teileMehrstimmig(anfrage);
    expect(t.haupt.speakers.map((s) => s.speakerId)).toEqual([
      'Claudia',
      'Julia',
    ]);
    expect(t.haupt.prompt.split('\n')).toHaveLength(5);
    expect(t.haupt.prompt).not.toContain('Thomas');
    expect(t.einzeln).toEqual([
      {
        index: 3,
        prompt: '[cheerful] Und ich möchte ein Schnitzel.',
        voice: 'Iapetus',
        styleInstructions: 'Im Restaurant.',
      },
    ]);
    expect(t.reihenfolge).toEqual([
      { haupt: 0 },
      { haupt: 1 },
      { haupt: 2 },
      { einzeln: 3 },
      { haupt: 3 },
      { haupt: 4 },
    ]);
  });

  it('counts the scene once per request it is sent with', () => {
    const t = teileMehrstimmig(anfrage);
    expect(zeichenMehrstimmig(t)).toBe(
      t.haupt.prompt.length +
        t.einzeln[0].prompt.length +
        2 * 'Im Restaurant.'.length,
    );
  });
});

describe('alleEinzeln (har satr alohida)', () => {
  it('asosiy suhbat bo`lmaydi, har satr o`z ovozida va qisqa uslub bilan', () => {
    const t = teileMehrstimmig(anfrage, true);
    expect(t.haupt.prompt).toBe('');
    expect(t.einzeln.map((e) => e.voice)).toEqual([
      'Erinome',
      'Callirrhoe',
      'Erinome',
      'Iapetus',
      'Erinome',
      'Callirrhoe',
    ]);
    expect(t.einzeln.every((e) => e.styleInstructions === EINZEL_STIL)).toBe(
      true,
    );
    expect(t.reihenfolge.every((p) => 'einzeln' in p)).toBe(true);
  });

  it('asosiy fayl bo`lmasa ffmpeg unga ulanmaydi, kirishlar 0 dan boshlanadi', () => {
    const args = zusammenFfmpegArgs({
      reihenfolge: [{ einzeln: 0 }, { einzeln: 1 }],
      schnitte: [],
      dauer: 0,
      haupt: '',
      einzeln: new Map([
        [0, 'a.mp3'],
        [1, 'b.mp3'],
      ]),
      ausgabe: 'out.mp3',
    });
    expect(args.filter((a) => a === '-i')).toHaveLength(2);
    expect(args).not.toContain('');
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('[0:a]');
    expect(graph).toContain('[1:a]');
    expect(graph).not.toContain('[2:a]');
  });
});
