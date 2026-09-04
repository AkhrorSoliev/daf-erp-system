import { luecke, reaktion, satzBauen, satzUebersetzen } from './satz-fragen';
import type { MaterialPhrase, MaterialSatz, MaterialWort } from './frage.types';

function s(id: number, de: string, uz: string): MaterialSatz {
  return { id, de, uz, sectionCode: 'u01-s1' };
}
function w(id: number, de: string, uz: string): MaterialWort {
  return { id, de, uz, artikel: null, anzeige: null, sectionCode: 'u01-s1' };
}
function p(id: number, funktionUz: string, de: string, uz: string): MaterialPhrase {
  return { id, funktionUz, de, uz, sectionCode: 'u01-s1' };
}

const rnd = (): number => 0;

describe('luecke', () => {
  const SATZ = s(1, 'Ich bin Anna.', 'Men Annaman.');

  it('bo`limning so`zini gapdan olib tashlaydi', () => {
    const f = luecke(SATZ, [w(2, 'bin', 'bo`lmoq')], rnd)!;
    expect(f.format).toBe('LUECKE');
    expect(f.prompt).toBe('Ich ___ Anna.');
    expect(f.richtig).toBe('bin');
    expect(f.hilfe).toBe('Men Annaman.');
  });

  it('gapda bo`limning so`zi bo`lmasa savol qurmaydi', () => {
    expect(luecke(SATZ, [w(2, 'danke', 'rahmat')], rnd)).toBeNull();
  });

  it('variant bermaydi — javob yoziladi', () => {
    const f = luecke(SATZ, [w(2, 'bin', 'bo`lmoq')], rnd)!;
    expect(f.options).toEqual([]);
  });
});

describe('satzBauen', () => {
  it('o`zbekchani so`raydi va so`z bankini beradi', () => {
    const f = satzBauen(s(1, 'Ich bin Anna.', 'Men Annaman.'), rnd)!;
    expect(f.format).toBe('SATZ_BAUEN');
    expect(f.prompt).toBe('Men Annaman.');
    expect(f.options.sort()).toEqual(['Anna', 'Ich', 'bin'].sort());
    expect(f.richtig).toBe('Ich bin Anna.');
  });

  it('ikki so`zli gapga savol qurmaydi', () => {
    // Ikki so'zdan gap tuzish tanlov emas: tartib bittagina.
    expect(satzBauen(s(1, 'Guten Tag.', 'Xayrli kun.'), rnd)).toBeNull();
  });
});

describe('satzUebersetzen', () => {
  const ZIEL = s(1, 'Ich bin Anna.', 'Men Annaman.');
  const ANDERE = [
    s(2, 'Du bist Timur.', 'Sen Timursan.'),
    s(3, 'Ich bin hier.', 'Men bu yerdaman.'),
    s(4, 'Wie geht es dir?', 'Ahvoling qanday?'),
  ];

  it('nemischani so`raydi va to`rt o`zbekcha variant beradi', () => {
    const f = satzUebersetzen(ZIEL, ANDERE, rnd)!;
    expect(f.format).toBe('SATZ_UEBERSETZEN');
    expect(f.prompt).toBe('Ich bin Anna.');
    expect(f.options).toHaveLength(4);
    expect(f.richtig).toBe('Men Annaman.');
  });

  it('chalg`ituvchi yetmasa savol qurmaydi', () => {
    expect(satzUebersetzen(ZIEL, ANDERE.slice(0, 1), rnd)).toBeNull();
  });
});

describe('reaktion', () => {
  const ZIEL = p(1, 'salomlashish', 'Guten Morgen!', 'Xayrli tong!');
  const ANDERE = [
    p(2, 'xayrlashish', 'Auf Wiedersehen!', 'Xayrli qoling!'),
    p(3, 'minnatdorchilik', 'Danke!', 'Rahmat!'),
    p(4, 'tanishtirish', 'Ich bin Anna.', 'Men Annaman.'),
  ];

  it('vaziyatni so`raydi va to`rt ibora beradi', () => {
    const f = reaktion(ZIEL, ANDERE, rnd)!;
    expect(f.format).toBe('REAKTION');
    expect(f.prompt).toBe('salomlashish');
    expect(f.options).toContain('Guten Morgen!');
    expect(f.richtig).toBe('Guten Morgen!');
  });

  it('bir xil vazifadagi iborani chalg`ituvchi qilmaydi', () => {
    // Ikki salomlashish iborasi orasida «to'g'ri» javob yo'q.
    const f = reaktion(ZIEL, [p(9, 'salomlashish', 'Hallo!', 'Salom!'), ...ANDERE], rnd)!;
    expect(f.options).not.toContain('Hallo!');
  });
});
