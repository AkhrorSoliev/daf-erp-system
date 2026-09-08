import {
  luecke,
  reaktion,
  satzBauen,
  satzUebersetzen,
  zuordnen,
} from './satz-fragen';
import { istRichtig } from './antwort';
import { baueSeans } from './seans';
import type { MaterialPhrase, MaterialSatz, MaterialWort } from './frage.types';

function s(id: number, de: string, uz: string): MaterialSatz {
  return { id, de, uz, sectionCode: 'u01-s1' };
}
function w(id: number, de: string, uz: string): MaterialWort {
  return {
    id,
    de,
    uz,
    artikel: null,
    anzeige: null,
    sectionCode: 'u01-s1',
    audioKey: null,
  };
}
function p(
  id: number,
  funktionUz: string,
  de: string,
  uz: string,
): MaterialPhrase {
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

  it('savol o`zligi SO`ZGA ishora qiladi, gapga emas', () => {
    // Javob har qanday boshqa so'z savoli kabi qayta hisoblanishi uchun
    // `itemType`/`itemId` bo'shatilgan SO'Zning o'zini ko'rsatishi kerak.
    const f = luecke(SATZ, [w(2, 'bin', 'bo`lmoq')], rnd)!;
    expect(f.itemType).toBe('WORT');
    expect(f.itemId).toBe(2);
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
    expect(f.itemType).toBe('WORT');
    expect(f.itemId).toBe(6);
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
    expect(f.itemType).toBe('WORT');
    expect(f.itemId).toBe(8);
  });

  // Finding 1: `luecke` faqat bo'shatilgan SO'Zni band qilardi
  // (`WORT:<id>`), gapning o'zini emas. Natijada xuddi shu gap bir
  // seansda `SATZ_BAUEN`/`SATZ_UEBERSETZEN` sifatida to'liq (bo'shatilgan
  // so'zi ham ko'rinadigan holda) qayta chiqib, javobni oshkor qilardi.
  it('belegteItems endi GAPNING o`zini ham band qiladi, faqat bo`shatilgan so`zni emas', () => {
    const satz = s(9, 'Ich trinke Kaffee heute.', 'Men bugun kofe ichaman.');
    const f = luecke(satz, [w(2, 'trinke', 'ichmoq')], rnd)!;
    expect(f.belegteItems.sort()).toEqual(['SATZ:9', 'WORT:2'].sort());
  });

  it('LUECKE ishlatgan gap bir seansda SATZ_BAUEN yoki SATZ_UEBERSETZEN sifatida qayta chiqmaydi', () => {
    const satz = s(9, 'Ich trinke Kaffee heute.', 'Men bugun kofe ichaman.');
    const boshqaGaplar = [
      s(20, 'Er isst Brot.', 'U non yeydi.'),
      s(21, 'Wir gehen nach Hause.', 'Biz uyga ketamiz.'),
      s(22, 'Sie liest ein Buch.', 'U kitob o`qiydi.'),
    ];

    const luecheSavoli = luecke(satz, [w(2, 'trinke', 'ichmoq')], rnd)!;
    const bauenSavoli = satzBauen(satz, rnd)!;
    const uebersetzenSavoli = satzUebersetzen(
      satz,
      [satz, ...boshqaGaplar],
      rnd,
    )!;
    expect(luecheSavoli).not.toBeNull();
    expect(bauenSavoli).not.toBeNull();
    expect(uebersetzenSavoli).not.toBeNull();

    // Uchtasi ham endi SATZ:9 kalitini "band" qiladi — `baueSeans`ning
    // material-takrorlash tekshiruvi (`belegteItems`) shuning uchun
    // faqat BITTASINI seansga qo'yishi mumkin, qaysi biri birinchi
    // tanlanishidan qat'i nazar.
    const { fragen } = baueSeans(
      [luecheSavoli, bauenSavoli, uebersetzenSavoli],
      3,
      rnd,
    );
    expect(fragen).toHaveLength(1);
    expect(['LUECKE', 'SATZ_BAUEN', 'SATZ_UEBERSETZEN']).toContain(
      fragen[0].format,
    );
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

  // Finding 4: to'g'ri javobdan FAQAT tinish belgisi bilan farq
  // qiladigan tarjima chalg'ituvchi bo'lsa, `istRichtig` (`normalisieren`
  // orqali solishtiradi) ikkalasini ham to'g'ri deb hisoblardi.
  //
  // `0.9999` — asl tartibni saqlaydigan rnd (yuqoridagi `reaktion`
  // testidagi izohga qarang): chalg'ituvchi RO'YXAT BOSHIDA qoladi va
  // filtr ishlamasa `slice(0, 3)` uni saqlab qolib, `options`da
  // ko'rinadi — shu bilan test filtrning o'zini sinaydi.
  it('richtigdan faqat tinish belgisi bilan farq qiladigan tarjima chalg`ituvchi bo`lmaydi', () => {
    const identityRnd = (): number => 0.9999;
    const birXilMatn = s(50, 'Ich schlafe.', 'Men Annaman!');
    const f = satzUebersetzen(ZIEL, [birXilMatn, ...ANDERE], identityRnd)!;
    expect(f.options).not.toContain('Men Annaman!');
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
    const f = reaktion(
      ZIEL,
      [p(9, 'salomlashish', 'Hallo!', 'Salom!'), ...ANDERE],
      rnd,
    )!;
    expect(f.options).not.toContain('Hallo!');
  });

  it('bir xil nemischa matnli, boshqa vazifadagi ibora chalg`ituvchi bo`lmaydi', () => {
    // Vazifasi boshqa bo'lsa ham, nemischa matni to'g'ri javob bilan bir
    // xil bo'lsa, uni distraktor qilish to'g'ri javobni `options` ichida
    // IKKI marta ko'rsatar edi.
    //
    // Umumiy `rnd = () => 0` bu yerda ISHLAMAYDI: u chapdan-birga-siljish
    // (mischen j===0 har doim), ya'ni ro'yxatning BIRINCHI elementi doim
    // oxiriga tushib, `slice(0, 3)` uni tashlab yuboradi — `birXilMatn`ni
    // ro'yxat boshiga qo'ysak ham, filtr bor-yo'qligidan qat'i nazar u
    // baribir chetlanadi va test hech narsani isbotlamay o'tib ketardi.
    // `() => 0.9999` esa j===i, ya'ni asl tartibni saqlaydi: shunda
    // `birXilMatn` `falsch`ning BIRINCHI o'rnida qoladi va (filtr bo'lmasa)
    // `slice(0, 3)` uni saqlab qoladi — filtrning o'zi sinaladi.
    const identityRnd = (): number => 0.9999;
    const birXilMatn = p(
      10,
      'boshqa-vazifa',
      'Guten Morgen!',
      'Boshqa tarjima',
    );
    const f = reaktion(ZIEL, [birXilMatn, ...ANDERE], identityRnd)!;
    expect(f.options.filter((o) => o === 'Guten Morgen!')).toHaveLength(1);
  });

  // Finding 4: to'g'ri javobdan FAQAT tinish belgisi bilan (matn
  // aynan bir xil emas) farq qiladigan ibora ham xuddi shu sababdan
  // chalg'ituvchi bo'lmasligi kerak — `istRichtig` ikkalasini bir xil
  // ko'radi. Yuqoridagi testdan farqi: bu yerda matn aynan bir xil
  // EMAS ('Guten Morgen!' vs 'Guten Morgen.'), faqat tinish belgisi
  // boshqa — xuddi shu `normalisieren` yo'li sinaladi.
  it('richtigdan faqat tinish belgisi bilan farq qiladigan ibora chalg`ituvchi bo`lmaydi', () => {
    const identityRnd = (): number => 0.9999;
    const birXilMatn = p(
      11,
      'boshqa-vazifa',
      'Guten Morgen.',
      'Boshqa tarjima',
    );
    const f = reaktion(ZIEL, [birXilMatn, ...ANDERE], identityRnd)!;
    expect(f.options).not.toContain('Guten Morgen.');
  });
});

describe('zuordnen', () => {
  // `rnd`ni `() => 0` qilmang: u chap-aylanma beradi, ayniqsatlik emas.
  // Identik almashtirish uchun `() => 0.9999` ishlatiladi (fayl boshidagi
  // `reaktion` testlaridagi izohga qarang).
  const rndId = (): number => 0.9999;

  const olti = [
    p(1, 'salomlashish', 'Hallo!', 'Salom!'),
    p(2, "o'zini tanishtirish", 'Ich bin Anna.', 'Men Annaman.'),
    p(3, 'xayrlashish', 'Auf Wiedersehen!', 'Xayr!'),
    p(4, 'rahmat aytish', 'Danke!', 'Rahmat!'),
    p(5, "so'rash", 'Wie heißen Sie?', 'Ismingiz nima?'),
    p(6, 'javob berish', 'Ich heiße Timur.', 'Mening ismim Timur.'),
  ];

  it('oltita juft quradi', () => {
    const f = zuordnen(olti, rndId)!;
    expect(f).not.toBeNull();
    expect(f.format).toBe('ZUORDNEN');
    expect(f.options).toHaveLength(12);
    expect(f.richtig.split('|')).toHaveLength(6);
  });

  it("chap ustun vaziyat, o'ng ustun ibora", () => {
    const f = zuordnen(olti, rndId)!;
    const chap = f.options.slice(0, 6);
    const ong = f.options.slice(6);
    expect(chap).toEqual(expect.arrayContaining(['salomlashish']));
    expect(ong).toEqual(expect.arrayContaining(['Hallo!']));
  });

  it("to'g'ri javob `vaziyat=ibora` shaklida", () => {
    const f = zuordnen(olti, rndId)!;
    for (const juft of f.richtig.split('|')) {
      const [v, i] = juft.split('=');
      expect(olti.some((ph) => ph.funktionUz === v && ph.de === i)).toBe(true);
    }
  });

  it('oltitadan kam ibora bo`lsa null', () => {
    expect(zuordnen(olti.slice(0, 5), rndId)).toBeNull();
  });

  it('bir xil vaziyat ikki marta tushmaydi', () => {
    const takror = [...olti.slice(0, 5), p(7, 'salomlashish', 'Hi!', 'Salom!')];
    // Oltinchi noyob vaziyat topilmadi — savol qurilmaydi.
    expect(zuordnen(takror, rndId)).toBeNull();
  });

  it("bir xil ibora matni ikki BOSHQA vaziyatga tushsa ham qurilmaydi", () => {
    // `funktionUz` ikkalasida ham noyob, lekin `de` bir xil ("Hallo!") —
    // `DafPhrase.de`da unique constraint yo'q, shuning uchun bu haqiqiy
    // holat. Mijozda o'ng ustunda ikkita bir xil matnli tugma chiqib,
    // birinchisi juftlangach ikkinchisi hech qachon tuzilmay qolardi
    // (Task 4 ko'rigi) — server bu savolni umuman qurmasligi kerak.
    const takrorDe = [
      ...olti.slice(0, 5),
      p(7, "yana bir vaziyat", 'Hallo!', 'Yana salom!'),
    ];
    // Oltinchi vaziyat noyob, lekin uning iborasi #1nikiga teng —
    // noyob `de`li oltinchi topilmadi, savol qurilmaydi.
    expect(zuordnen(takrorDe, rndId)).toBeNull();
  });

  it('oltita iborani BAND qiladi', () => {
    const f = zuordnen(olti, rndId)!;
    expect(f.belegteItems).toHaveLength(6);
    expect(new Set(f.belegteItems).size).toBe(6);
  });
});
