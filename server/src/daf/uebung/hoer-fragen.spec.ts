import { hoerenWahl } from './hoer-fragen';
import type { MaterialDialog } from './frage.types';

const dialog = (): MaterialDialog => ({
  id: 5,
  titelDe: 'Meine Schwester',
  sectionCode: 'u02-s1',
  audioKey: 'daf/audio/abc.mp3',
  zeilen: [
    { id: 50, sprecher: 'Anna', de: 'Ist das deine Schwester?', uz: 'x' },
    { id: 51, sprecher: 'Jonas', de: 'Nein, das ist meine Tochter.', uz: 'x' },
    { id: 52, sprecher: 'Anna', de: 'Wo wohnen sie?', uz: 'x' },
    { id: 53, sprecher: 'Jonas', de: 'In Deutschland.', uz: 'x' },
  ],
  fragen: [
    {
      id: 71,
      frageDe: 'Wer ist Lena?',
      frageUz: 'Lena kim?',
      richtig: 'die Tochter',
      falsch: ['die Schwester', 'die Mutter'],
    },
    {
      id: 72,
      frageDe: 'Wo wohnen die Eltern?',
      frageUz: 'Qayerda?',
      richtig: 'in Deutschland',
      falsch: ['in Usbekistan', 'hier'],
    },
  ],
});

const mediaUrl = (key: string) => `https://r2.example/${key}`;

describe('hoerenWahl', () => {
  it('savol quradi: prompt — nemischa savol, hilfe — o`zbekchasi, 3 variant', () => {
    const f = hoerenWahl(dialog(), () => 0, mediaUrl)!;
    expect(f).not.toBeNull();
    expect(f.format).toBe('HOEREN_WAHL');
    expect(f.itemType).toBe('HOERFRAGE');
    expect(f.itemId).toBe(71);
    expect(f.prompt).toBe('Wer ist Lena?');
    expect(f.hilfe).toBe('Lena kim?');
    expect(f.options).toHaveLength(3);
    expect(f.options).toContain('die Tochter');
    expect(f.richtig).toBe('die Tochter');
    expect(f.audioUrl).toBe('https://r2.example/daf/audio/abc.mp3');
    // `titel` YO'Q (ko'rik topilmasi): `dialog.titelDe` ba'zi suhbatlarda
    // javobning o'zi ("W wie Weber" → "W" kabi) — savol bilan birga
    // yuborilsa, javobni oldindan oshkor qilardi. Mijoz bu format uchun
    // `titel`ni baribir ko'rsatmaydi (qarang `hoer-fragen.ts` boshidagi izoh).
    expect(f.titel).toBeUndefined();
  });

  it('rnd savolni tanlaydi', () => {
    expect(hoerenWahl(dialog(), () => 0.99, mediaUrl)!.itemId).toBe(72);
  });

  it('variantlar aralashtiriladi — to`g`ri javob doim birinchi emas', () => {
    const joylar = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      const f = hoerenWahl(dialog(), () => i / 20, mediaUrl)!;
      joylar.add(f.options.indexOf(f.richtig));
    }
    expect(joylar.size).toBeGreaterThan(1);
  });

  it('suhbat matni promptda YO`Q — eshitish, o`qish emas', () => {
    const f = hoerenWahl(dialog(), () => 0, mediaUrl)!;
    expect(f.prompt).not.toContain('Tochter.');
    expect(JSON.stringify(f)).not.toContain('Nein, das ist meine Tochter');
  });

  it('suhbatning HAMMA satrini band qiladi', () => {
    const f = hoerenWahl(dialog(), () => 0, mediaUrl)!;
    expect(f.belegteItems.sort()).toEqual([
      'DIALOGZEILE:50',
      'DIALOGZEILE:51',
      'DIALOGZEILE:52',
      'DIALOGZEILE:53',
      'HOERFRAGE:71',
    ]);
  });

  it('audioKey yo`q — savol qurilmaydi', () => {
    expect(
      hoerenWahl({ ...dialog(), audioKey: null }, () => 0, mediaUrl),
    ).toBeNull();
  });

  it('R2_PUBLIC_URL sozlanmagan (resolver null) — savol qurilmaydi', () => {
    expect(
      hoerenWahl(
        dialog(),
        () => 0,
        () => null,
      ),
    ).toBeNull();
  });

  it('savoli yo`q dialogdan savol qurilmaydi', () => {
    expect(
      hoerenWahl({ ...dialog(), fragen: [] }, () => 0, mediaUrl),
    ).toBeNull();
  });
});
