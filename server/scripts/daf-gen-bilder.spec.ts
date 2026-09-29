import {
  BILD_CHEGARASI,
  BILD_PREIS,
  bezahlteBilder,
  erstelleBildGeneriere,
  generiereBilderNacheinander,
  parseBildArgs,
  pruefeBildBudget,
  zuZeichnen,
  type BildAuftrag,
} from './daf-gen-bilder';
import { bildPrompt } from '../src/daf/media/bild-stil';
import { seedFor } from '../src/daf/media/media-keys';
import type { BildPlan } from '../src/daf/inhalt/bild-plan';
import type { BildManifest } from '../src/daf/media/bild-keys';

const argv = (...rest: string[]) => ['node', 'daf-gen-bilder.ts', ...rest];
const KEY = /^daf\/bild\/[0-9a-f]{32}\.jpg$/;

describe('parseBildArgs', () => {
  it('needs --unit', () => {
    expect(() => parseBildArgs(argv('--dry-run'))).toThrow(/--unit/);
  });

  it('reads one unit, --dry-run and --ersetzen with an optional attempt', () => {
    expect(
      parseBildArgs(
        argv(
          '--unit',
          '3',
          '--dry-run',
          '--ersetzen',
          'u03-s4-fahrrad,u03-s4-auto@2',
        ),
      ),
    ).toEqual({
      unit: 'u03',
      dryRun: true,
      ersetzen: [
        { sourceId: 'u03-s4-fahrrad', versuch: 1 },
        { sourceId: 'u03-s4-auto', versuch: 2 },
      ],
    });
  });

  it('keeps a repeated --unit or --ersetzen once — nothing is paid twice', () => {
    expect(
      parseBildArgs(
        argv(
          '--unit',
          '3',
          '--unit',
          '3',
          '--ersetzen',
          'u03-s4-fahrrad',
          '--ersetzen',
          'u03-s4-fahrrad',
        ),
      ),
    ).toEqual({
      unit: 'u03',
      dryRun: false,
      ersetzen: [{ sourceId: 'u03-s4-fahrrad', versuch: 1 }],
    });
  });

  it('refuses two different units in one run', () => {
    expect(() => parseBildArgs(argv('--unit', '2', '--unit', '3'))).toThrow(
      /bitta unit/,
    );
  });

  it('refuses a redraw of another unit`s word or attempt 0', () => {
    expect(() =>
      parseBildArgs(argv('--unit', '3', '--ersetzen', 'u02-s1-mutter')),
    ).toThrow(/u02-s1-mutter/);
    expect(() =>
      parseBildArgs(argv('--unit', '3', '--ersetzen', 'u03-s4-auto@0')),
    ).toThrow(/u03-s4-auto@0/);
  });
});

describe('zuZeichnen', () => {
  const plan: BildPlan = {
    'u03-s4-fahrrad': { szene: 'a bicycle', tippen: true },
    'u03-s4-auto': { szene: 'a small red car', tippen: true },
    'u03-s4-bus': { szene: 'a city bus', tippen: true },
    'u02-s1-mutter': { szene: 'a mother', tippen: false },
  };
  const manifest: BildManifest = {
    'u03-s4-auto': 'daf/bild/0123456789abcdef0123456789abcdef.jpg',
  };

  it('draws the unit`s planned words that have no picture yet, attempt 0', () => {
    expect(zuZeichnen(plan, manifest, 'u03', [])).toEqual([
      { sourceId: 'u03-s4-fahrrad', szene: 'a bicycle', versuch: 0 },
      { sourceId: 'u03-s4-bus', szene: 'a city bus', versuch: 0 },
    ]);
  });

  it('adds a redraw with its attempt, even when the word has a picture', () => {
    expect(
      zuZeichnen(plan, manifest, 'u03', [
        { sourceId: 'u03-s4-auto', versuch: 2 },
      ]),
    ).toEqual([
      { sourceId: 'u03-s4-fahrrad', szene: 'a bicycle', versuch: 0 },
      { sourceId: 'u03-s4-auto', szene: 'a small red car', versuch: 2 },
      { sourceId: 'u03-s4-bus', szene: 'a city bus', versuch: 0 },
    ]);
  });

  it('refuses a redraw of a word that is not planned — a typo costs nothing', () => {
    expect(() =>
      zuZeichnen(plan, manifest, 'u03', [
        { sourceId: 'u03-s4-fahrad', versuch: 1 },
      ]),
    ).toThrow(/u03-s4-fahrad/);
  });
});

describe('pruefeBildBudget', () => {
  it('lets a run up to the limit through and stops one past it before any call', () => {
    expect(() => pruefeBildBudget(BILD_CHEGARASI)).not.toThrow();
    expect(() => pruefeBildBudget(BILD_CHEGARASI + 1)).toThrow(/TO'XTATILDI/);
  });

  it('prices a 1024 px square at $0.003 per megapixel', () => {
    expect(BILD_PREIS).toBeCloseTo(0.003 * 1.048576, 10);
  });
});

describe('erstelleBildGeneriere', () => {
  const auftrag: BildAuftrag = {
    sourceId: 'u03-s4-fahrrad',
    szene: 'a bicycle',
    versuch: 0,
  };

  function deps(ok = true) {
    const fal = {
      image: jest.fn(async () => 'https://fal.media/files/x.jpeg'),
    };
    const uploader = { uploadBytes: jest.fn(async () => undefined) };
    const fetchFn = jest.fn(async () => ({
      ok,
      status: ok ? 200 : 404,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })) as unknown as typeof fetch;
    const verkleinere = jest.fn(async () => Buffer.from([0xff, 0xd8, 9]));
    return { fal, uploader, fetchFn, verkleinere };
  }

  it('draws in the style with the stable seed, shrinks, and uploads under a new random key', async () => {
    const { fal, uploader, fetchFn, verkleinere } = deps();
    const key = await erstelleBildGeneriere(
      fal,
      uploader,
      fetchFn,
      verkleinere,
    )(auftrag);

    expect(fal.image).toHaveBeenCalledWith(
      bildPrompt('a bicycle'),
      seedFor('u03-s4-fahrrad', 0),
    );
    expect(verkleinere).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(key).toMatch(KEY);
    expect(uploader.uploadBytes).toHaveBeenCalledWith(
      key,
      Buffer.from([0xff, 0xd8, 9]),
    );
  });

  it('a redraw asks with its own attempt`s seed', async () => {
    const { fal, uploader, fetchFn, verkleinere } = deps();
    await erstelleBildGeneriere(
      fal,
      uploader,
      fetchFn,
      verkleinere,
    )({ ...auftrag, versuch: 2 });
    expect(fal.image).toHaveBeenCalledWith(
      bildPrompt('a bicycle'),
      seedFor('u03-s4-fahrrad', 2),
    );
  });

  it('a failed download stops before shrinking or uploading', async () => {
    const { fal, uploader, fetchFn, verkleinere } = deps(false);
    await expect(
      erstelleBildGeneriere(fal, uploader, fetchFn, verkleinere)(auftrag),
    ).rejects.toThrow(/404/);
    expect(verkleinere).not.toHaveBeenCalled();
    expect(uploader.uploadBytes).not.toHaveBeenCalled();
  });

  it('a flag is drawn in code too', async () => {
    const { fal, uploader, fetchFn, verkleinere } = deps();
    const rendere = jest.fn(async (_svg: string) => Buffer.from([1]));
    await erstelleBildGeneriere(
      fal,
      uploader,
      fetchFn,
      verkleinere,
      rendere,
    )({ sourceId: 'u01-s3-usbekistan', flagge: 'UZ', versuch: 0 });
    expect(rendere.mock.calls[0][0]).toContain('class="stern"');
    expect(fal.image).not.toHaveBeenCalled();
    expect(uploader.uploadBytes).toHaveBeenCalled();
  });

  it('a number is drawn in code: no fal.ai call, no download', async () => {
    const { fal, uploader, fetchFn, verkleinere } = deps();
    const rendere = jest.fn(async (_svg: string) => Buffer.from([7]));
    const key = await erstelleBildGeneriere(
      fal,
      uploader,
      fetchFn,
      verkleinere,
      rendere,
    )({ sourceId: 'u01-s4-sieben', zahl: 7, versuch: 0 });
    expect(rendere.mock.calls[0][0]).toMatch(/>7<\/text>/);
    expect(fal.image).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(verkleinere).toHaveBeenCalledWith(Buffer.from([7]));
    expect(uploader.uploadBytes).toHaveBeenCalledWith(
      key,
      Buffer.from([0xff, 0xd8, 9]),
    );
  });
});

describe('number pictures in the plan', () => {
  const plan: BildPlan = {
    'u01-s4-sieben': { zahl: 7, tippen: false },
    'u01-s3-deutschland': { szene: 'the Brandenburg Gate', tippen: false },
  };

  it('are drawn with their number', () => {
    expect(zuZeichnen(plan, {}, 'u01', [])).toEqual([
      { sourceId: 'u01-s4-sieben', zahl: 7, versuch: 0 },
      {
        sourceId: 'u01-s3-deutschland',
        szene: 'the Brandenburg Gate',
        versuch: 0,
      },
    ]);
  });

  it('cost nothing: only scenes are paid for', () => {
    expect(bezahlteBilder(zuZeichnen(plan, {}, 'u01', []))).toBe(1);
  });

  it('a flag in the plan is drawn as a flag and costs nothing', () => {
    const mitFlagge: BildPlan = {
      'u01-s3-usbekistan': { flagge: 'UZ', tippen: false },
    };
    const auftraege = zuZeichnen(mitFlagge, {}, 'u01', []);
    expect(auftraege).toEqual([
      { sourceId: 'u01-s3-usbekistan', flagge: 'UZ', versuch: 0 },
    ]);
    expect(bezahlteBilder(auftraege)).toBe(0);
  });
});

describe('generiereBilderNacheinander', () => {
  const a = (sourceId: string): BildAuftrag => ({
    sourceId,
    szene: 'x',
    versuch: 0,
  });

  it('saves the manifest after every picture', async () => {
    const manifest: BildManifest = {};
    const gespeichert: BildManifest[] = [];
    let n = 0;
    await generiereBilderNacheinander(
      [a('u03-s4-fahrrad'), a('u03-s4-bus')],
      manifest,
      async () => `daf/bild/${String(++n).padStart(32, '0')}.jpg`,
      (m) => gespeichert.push({ ...m }),
    );
    expect(gespeichert).toEqual([
      { 'u03-s4-fahrrad': `daf/bild/${'1'.padStart(32, '0')}.jpg` },
      {
        'u03-s4-fahrrad': `daf/bild/${'1'.padStart(32, '0')}.jpg`,
        'u03-s4-bus': `daf/bild/${'2'.padStart(32, '0')}.jpg`,
      },
    ]);
  });

  it('keeps the pictures already paid for when a later one fails', async () => {
    const manifest: BildManifest = {};
    const speichere = jest.fn();
    await expect(
      generiereBilderNacheinander(
        [a('u03-s4-fahrrad'), a('u03-s4-bus')],
        manifest,
        async (auftrag) => {
          if (auftrag.sourceId === 'u03-s4-bus') throw new Error('fal 500');
          return 'daf/bild/0123456789abcdef0123456789abcdef.jpg';
        },
        speichere,
      ),
    ).rejects.toThrow(/u03-s4-bus.*fal 500/);
    expect(manifest).toEqual({
      'u03-s4-fahrrad': 'daf/bild/0123456789abcdef0123456789abcdef.jpg',
    });
    expect(speichere).toHaveBeenCalledTimes(1);
  });
});
