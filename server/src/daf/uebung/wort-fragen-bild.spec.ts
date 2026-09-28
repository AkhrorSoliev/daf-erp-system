import { audioBild, bildTippen, bildWort } from './wort-fragen';
import { toPublic, type MaterialWort } from './frage.types';

// Picture word formats (2026-09-27): the CEO asked for Duolingo-style picture
// exercises; the builders follow `audioWort`/`wortTippen` — no picture, no
// question.

const mediaUrl = (key: string): string => `https://media.example.com/${key}`;
const rnd = (): number => 0;

function bild(
  id: number,
  de: string,
  uz: string,
  art: string | null = null,
  opts: { audio?: boolean; tippen?: boolean; bild?: boolean } = {},
): MaterialWort {
  return {
    id,
    de,
    uz,
    artikel: art,
    anzeige: null,
    sectionCode: 'u03-s1',
    audioKey: opts.audio === false ? null : `daf/audio/a${id}.mp3`,
    imageKey: opts.bild === false ? null : `daf/bild/b${id}.jpg`,
    bildTippen: opts.tippen ?? false,
  };
}

const BAHNHOF = bild(1, 'Bahnhof', 'vokzal', 'der', { tippen: true });
const POOL = [
  bild(2, 'Post', 'pochta', 'die'),
  bild(3, 'Kino', 'kino', 'das'),
  bild(4, 'Bank', 'bank', 'die'),
  bild(5, 'Park', 'park', 'der'),
];

describe('bildWort', () => {
  it('shows the word with its article and offers 4 picture URLs, one of them its own', () => {
    const f = bildWort(BAHNHOF, POOL, rnd, mediaUrl)!;
    expect(f.format).toBe('BILD_WORT');
    expect(f.itemType).toBe('WORT');
    expect(f.prompt).toBe('der Bahnhof');
    expect(f.options).toHaveLength(4);
    expect(new Set(f.options).size).toBe(4);
    expect(f.richtig).toBe('https://media.example.com/daf/bild/b1.jpg');
    expect(f.options).toContain(f.richtig);
    expect(f.audioUrl).toBe('https://media.example.com/daf/audio/a1.mp3');
    expect(f.belegteItems).toEqual(['WORT:1']);
  });

  it('never names a word in an option URL', () => {
    const f = bildWort(BAHNHOF, POOL, rnd, mediaUrl)!;
    for (const o of f.options) {
      expect(o.toLowerCase()).not.toMatch(/bahnhof|post|kino|bank|park/);
    }
  });

  it('is not built without an image, or with fewer than 3 picture distractors', () => {
    expect(
      bildWort(
        bild(1, 'Bahnhof', 'vokzal', 'der', { bild: false }),
        POOL,
        rnd,
        mediaUrl,
      ),
    ).toBeNull();
    expect(bildWort(BAHNHOF, POOL.slice(0, 2), rnd, mediaUrl)).toBeNull();
    const ohneBild = POOL.map((w) => ({ ...w, imageKey: null }));
    expect(bildWort(BAHNHOF, ohneBild, rnd, mediaUrl)).toBeNull();
  });

  it('skips distractors that share the picture or the word', () => {
    const doppelt = [
      { ...POOL[0], imageKey: BAHNHOF.imageKey },
      { ...POOL[1], de: 'bahnhof' },
      ...POOL.slice(2),
    ];
    expect(bildWort(BAHNHOF, doppelt, rnd, mediaUrl)).toBeNull();
  });

  it('plays no audio when the word has none, but still asks', () => {
    const f = bildWort(
      bild(1, 'Bahnhof', 'vokzal', 'der', { audio: false }),
      POOL,
      rnd,
      mediaUrl,
    )!;
    expect(f.audioUrl).toBeNull();
  });

  it('is not built when media URLs cannot be formed', () => {
    expect(bildWort(BAHNHOF, POOL, rnd, () => null)).toBeNull();
  });
});

describe('audioBild', () => {
  it('shows no word: only the audio and 4 picture options', () => {
    const f = audioBild(BAHNHOF, POOL, rnd, mediaUrl)!;
    expect(f.format).toBe('AUDIO_BILD');
    expect(f.prompt).toBe('');
    expect(f.audioUrl).toBe('https://media.example.com/daf/audio/a1.mp3');
    expect(f.options).toHaveLength(4);
    expect(f.richtig).toBe('https://media.example.com/daf/bild/b1.jpg');
    expect(f.options).toContain(f.richtig);
  });

  it('needs both audio and picture', () => {
    expect(
      audioBild(
        bild(1, 'Bahnhof', 'vokzal', 'der', { audio: false }),
        POOL,
        rnd,
        mediaUrl,
      ),
    ).toBeNull();
    expect(
      audioBild(
        bild(1, 'Bahnhof', 'vokzal', 'der', { bild: false }),
        POOL,
        rnd,
        mediaUrl,
      ),
    ).toBeNull();
  });
});

describe('bildTippen', () => {
  it('shows only the picture and expects the word with its article', () => {
    const f = bildTippen(BAHNHOF, rnd, mediaUrl)!;
    expect(f.format).toBe('BILD_TIPPEN');
    expect(f.prompt).toBe('');
    expect(f.options).toEqual([]);
    expect(f.bildUrl).toBe('https://media.example.com/daf/bild/b1.jpg');
    expect(f.richtig).toBe('der Bahnhof');
    expect(f.audioUrl).toBeNull();
  });

  it('is only built for a word marked unambiguous that has an article and a picture', () => {
    expect(
      bildTippen({ ...BAHNHOF, bildTippen: false }, rnd, mediaUrl),
    ).toBeNull();
    expect(bildTippen({ ...BAHNHOF, artikel: null }, rnd, mediaUrl)).toBeNull();
    expect(
      bildTippen({ ...BAHNHOF, imageKey: null }, rnd, mediaUrl),
    ).toBeNull();
    expect(bildTippen(BAHNHOF, rnd, () => null)).toBeNull();
  });

  it('carries bildUrl to the public question', () => {
    const f = bildTippen(BAHNHOF, rnd, mediaUrl)!;
    expect(toPublic(f, 0).bildUrl).toBe(
      'https://media.example.com/daf/bild/b1.jpg',
    );
  });
});
