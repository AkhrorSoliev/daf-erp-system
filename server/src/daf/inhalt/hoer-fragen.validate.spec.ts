import { validateHoerFragen } from './hoer-fragen.validate';
import type { Dialog } from './unit-inhalt.types';

const basis = (): Dialog => ({
  id: 'u02-d2',
  section: 'u02-s1',
  titelDe: 'Meine Schwester',
  titelUz: 'Mening opam',
  zeilen: [
    { sprecher: 'Anna', de: 'Ist das deine Schwester?', uz: 'x' },
    { sprecher: 'Jonas', de: 'Nein, das ist meine Tochter.', uz: 'x' },
    { sprecher: 'Anna', de: 'Wo wohnen sie?', uz: 'x' },
    { sprecher: 'Jonas', de: 'Meine Eltern wohnen in Deutschland.', uz: 'x' },
  ],
  fragen: [
    {
      frageDe: 'Wer ist Nodira?',
      frageUz: 'Nodira kim?',
      richtig: 'die Tochter',
      falsch: ['die Schwester', 'die Mutter'],
    },
    {
      frageDe: 'Wo wohnen die Eltern?',
      frageUz: 'Ota-onasi qayerda yashaydi?',
      richtig: 'in Deutschland',
      falsch: ['in Usbekistan', 'hier'],
    },
  ],
});

// Progressiya funksiyasi testda soxta: hech qanday so'z notanish emas.
const allesBekannt = (): string[] => [];

describe('validateHoerFragen', () => {
  it('toza dialogda muammo yo`q', () => {
    expect(validateHoerFragen(basis(), allesBekannt)).toEqual([]);
  });

  it('savol soni aniq 2 bo`lishi kerak', () => {
    const d = basis();
    d.fragen = [d.fragen![0]];
    expect(validateHoerFragen(d, allesBekannt)).toEqual([
      'u02-d2: 1 ta savol — aniq 2 kerak',
    ]);
  });

  it('fragen yo`q bo`lsa ham 2 kerak deb yiqiladi', () => {
    const d = basis();
    delete d.fragen;
    expect(validateHoerFragen(d, allesBekannt)).toEqual([
      'u02-d2: 0 ta savol — aniq 2 kerak',
    ]);
  });

  it('to`g`ri javob chalg`ituvchilar orasida takrorlansa yiqiladi', () => {
    const d = basis();
    d.fragen![0].falsch = ['die Tochter.', 'die Mutter'];
    expect(validateHoerFragen(d, allesBekannt)).toEqual([
      'u02-d2-f1: variantlar har xil emas — «die Tochter.» takror',
    ]);
  });

  it('uchta variant bo`lmasa yiqiladi', () => {
    const d = basis();
    d.fragen![1].falsch = ['hier'];
    expect(validateHoerFragen(d, allesBekannt)).toEqual([
      'u02-d2-f2: 2 variant — 3 kerak (richtig + 2 falsch)',
    ]);
  });

  it('notanish so`z savol, javob va chalg`ituvchida ushlanadi', () => {
    const d = basis();
    const unbekannt = (text: string): string[] =>
      text.includes('Usbekistan') ? ['usbekistan'] : [];
    expect(validateHoerFragen(d, unbekannt)).toEqual([
      'u02-d2-f2: notanish so`z — usbekistan',
    ]);
  });

  it('frageUz bo`sh yoki kirillcha bo`lsa yiqiladi', () => {
    const d = basis();
    d.fragen![0].frageUz = 'Нодира ким?';
    d.fragen![1].frageUz = '   ';
    expect(validateHoerFragen(d, allesBekannt)).toEqual([
      'u02-d2-f1: frageUz lotin alifbosida emas',
      'u02-d2-f2: frageUz bo`sh',
    ]);
  });

  it('to`g`ri javobning mazmunli so`zi suhbatda bo`lmasa yiqiladi', () => {
    const d = basis();
    d.fragen![1].richtig = 'in Usbekistan';
    d.fragen![1].falsch = ['in Deutschland', 'hier'];
    expect(validateHoerFragen(d, allesBekannt)).toEqual([
      'u02-d2-f2: to`g`ri javob «in Usbekistan» suhbatda aytilmagan',
    ]);
  });

  it('faqat yordamchi so`zdan iborat javobga suhbat qoidasi qo`llanmaydi', () => {
    // «ja» — ma'noli so'zsiz; mashina bu yerda hech narsa deya olmaydi.
    const d = basis();
    d.fragen![0].richtig = 'ja';
    d.fragen![0].falsch = ['nein', 'nicht'];
    expect(validateHoerFragen(d, allesBekannt)).toEqual([]);
  });
});
