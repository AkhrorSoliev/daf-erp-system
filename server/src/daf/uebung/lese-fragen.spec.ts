import { lesenWahl } from './lese-fragen';
import type { MaterialDialog } from './frage.types';

const chat = (): MaterialDialog => ({
  id: 9,
  titelDe: 'Chat',
  sectionCode: 'u06-s2',
  art: 'CHAT',
  sahnaUz: 'Julia Thomasga yozyapti.',
  audioKey: null,
  zeilen: [
    { id: 90, sprecher: 'Julia', de: 'Hast du am Samstag Zeit?', uz: 'x' },
    { id: 91, sprecher: 'Thomas', de: 'Ja, ich habe Zeit.', uz: 'x' },
    { id: 92, sprecher: 'Julia', de: 'Wir spielen Tennis.', uz: 'x' },
    { id: 93, sprecher: 'Thomas', de: 'Gut, dann bis Samstag!', uz: 'x' },
  ],
  fragen: [
    {
      id: 81,
      frageDe: 'Was spielt Julia?',
      frageUz: 'Julia nima o`ynaydi?',
      richtig: 'Tennis',
      falsch: ['Fußball', 'Basketball'],
    },
    {
      id: 82,
      frageDe: 'Wann treffen sie sich?',
      frageUz: 'Qachon uchrashadi?',
      richtig: 'am Samstag',
      falsch: ['am Montag', 'am Sonntag'],
    },
  ],
});

describe('lesenWahl', () => {
  it('savol quradi: prompt — nemischa savol, hilfe — o`zbekchasi, 3 variant', () => {
    const f = lesenWahl(chat(), () => 0)!;
    expect(f.format).toBe('LESEN_WAHL');
    expect(f.itemType).toBe('HOERFRAGE');
    expect(f.itemId).toBe(81);
    expect(f.prompt).toBe('Was spielt Julia?');
    expect(f.hilfe).toBe('Julia nima o`ynaydi?');
    expect(f.options).toHaveLength(3);
    expect(f.options).toContain('Tennis');
    expect(f.richtig).toBe('Tennis');
    expect(f.audioUrl).toBeNull();
  });

  it('matn savol bilan birga yuboriladi — o`zbekcha tarjimasiz', () => {
    const f = lesenWahl(chat(), () => 0)!;
    expect(f.lesetext).toEqual({
      art: 'CHAT',
      titel: 'Chat',
      sahnaUz: 'Julia Thomasga yozyapti.',
      zeilen: [
        { sprecher: 'Julia', de: 'Hast du am Samstag Zeit?' },
        { sprecher: 'Thomas', de: 'Ja, ich habe Zeit.' },
        { sprecher: 'Julia', de: 'Wir spielen Tennis.' },
        { sprecher: 'Thomas', de: 'Gut, dann bis Samstag!' },
      ],
    });
    // Tarjima javobdan KEYIN ochiladi (`pruefen` → transkript).
    expect(JSON.stringify(f.lesetext)).not.toContain('"uz"');
  });

  it('rnd savolni tanlaydi', () => {
    expect(lesenWahl(chat(), () => 0.99)!.itemId).toBe(82);
  });

  it('variantlar aralashtiriladi', () => {
    const joylar = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      const f = lesenWahl(chat(), () => i / 20)!;
      joylar.add(f.options.indexOf(f.richtig));
    }
    expect(joylar.size).toBeGreaterThan(1);
  });

  it('matnning HAMMA satrini va savolni band qiladi', () => {
    const f = lesenWahl(chat(), () => 0)!;
    expect(f.belegteItems.sort()).toEqual([
      'DIALOGZEILE:90',
      'DIALOGZEILE:91',
      'DIALOGZEILE:92',
      'DIALOGZEILE:93',
      'HOERFRAGE:81',
    ]);
  });

  it.each(['CHAT', 'TEXT', 'TABELLE'] as const)('%s uchun quriladi', (art) => {
    expect(lesenWahl({ ...chat(), art }, () => 0)).not.toBeNull();
  });

  it('audio matn (DIALOG, ANSAGE) uchun qurilmaydi — u eshitish materiali', () => {
    expect(lesenWahl({ ...chat(), art: 'DIALOG' }, () => 0)).toBeNull();
    expect(lesenWahl({ ...chat(), art: 'ANSAGE' }, () => 0)).toBeNull();
  });

  it('art yozilmagan matn — DIALOG hisoblanadi, qurilmaydi', () => {
    const { art: _art, ...ohne } = chat();
    expect(lesenWahl(ohne as MaterialDialog, () => 0)).toBeNull();
  });

  it('savoli yo`q matndan savol qurilmaydi', () => {
    expect(lesenWahl({ ...chat(), fragen: [] }, () => 0)).toBeNull();
  });
});
