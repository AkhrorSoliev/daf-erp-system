import { luecke, reaktion, satzBauen, satzUebersetzen } from './satz-fragen';
import { istRichtig } from './antwort';
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

  it('umlautli so`zni ham bo`shatadi (regex \\b ASCII bilan cheklangan edi)', () => {
    // `\büben\b` hech qachon topilmas edi: probel ham, 'ü' ham regex
    // uchun "so'z emas" hisoblanadi, ya'ni ular orasida chegara ko'rinmaydi.
    const satz2 = s(5, 'Wir üben heute.', 'Biz bugun mashq qilamiz.');
    const f = luecke(satz2, [w(6, 'üben', 'mashq qilmoq')], rnd)!;
    expect(f).not.toBeNull();
    expect(f.prompt).toBe('Wir ___ heute.');
    expect(f.richtig).toBe('üben');
  });

  it('apostrofli qisqartmani noto`g`ri nishonlamaydi', () => {
    // "geht's" — "geht" so'zi bilan bir xil TOKEN emas, shuning uchun
    // uni chalg'itib "___'s" kabi chala gap qoldirmasligi kerak. Standalone
    // "geht" gapning davomida bo'lsa, aynan o'sha joy bo'shatiladi.
    const satz3 = s(
      7,
      "Wie geht's? Es geht mir gut.",
      'Ahvoling qanday? Menda hammasi yaxshi.',
    );
    const f = luecke(satz3, [w(8, 'geht', 'bormoq')], rnd)!;
    expect(f).not.toBeNull();
    expect(f.prompt).toBe("Wie geht's? Es ___ mir gut.");
    expect(f.richtig).toBe('geht');
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

  it('chiplar tinishsiz bo`lsa ham, birlashtirilgan javob baholovchida to`g`ri hisoblanadi', () => {
    // `options` tinish belgisiz (woerterVon nuqta/vergulni olib tashlaydi),
    // `richtig` esa asl (tinishli) gapning o'zi. Ularning mos kelishi
    // savol quruvchining ishi emas — `istRichtig` (Vazifa 1) taqqoslashdan
    // OLDIN ikkalasini ham tinish belgisidan tozalaydi, shuning uchun
    // xavfsiz. rnd=0.9999 → mischen j===i har doim, ya'ni asl so'z tartibi
    // saqlanadi va chiplarni to'g'ridan-to'g'ri birlashtirish mumkin.
    const identityRnd = (): number => 0.9999;
    const satz = s(9, 'Ja, ich bin Anna.', 'Ha, men Annaman.');
    const f = satzBauen(satz, identityRnd)!;
    const gegeben = f.options.join(' ');
    expect(istRichtig(gegeben, f.richtig)).toBe(true);
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

  it('bir xil nemischa matnli, boshqa vazifadagi ibora chalg`ituvchi bo`lmaydi', () => {
    // Vazifasi boshqa bo'lsa ham, nemischa matni to'g'ri javob bilan bir
    // xil bo'lsa, uni distraktor qilish to'g'ri javobni `options` ichida
    // IKKI marta ko'rsatar edi.
    const birXilMatn = p(10, 'boshqa-vazifa', 'Guten Morgen!', 'Boshqa tarjima');
    const f = reaktion(ZIEL, [birXilMatn, ...ANDERE], rnd)!;
    expect(f.options.filter((o) => o === 'Guten Morgen!')).toHaveLength(1);
  });
});
