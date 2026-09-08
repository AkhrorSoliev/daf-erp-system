import {
  artikel,
  audioWort,
  paar,
  uzWort,
  wortTippen,
  wortUz,
} from './wort-fragen';
import { toPublic, type Frage, type MaterialWort } from './frage.types';

function w(
  id: number,
  de: string,
  uz: string,
  art: string | null = null,
): MaterialWort {
  return {
    id,
    de,
    uz,
    artikel: art,
    anzeige: null,
    sectionCode: 'u01-s1',
    // Bu yordamchi audio formatlarga tegishli emas — mavjud testlar
    // audiosiz so'zlar bilan ishlaydi.
    audioKey: null,
  };
}

/** Aralashtirishni bashorat qilib bo'ladigan qilish uchun. */
const rnd = (): number => 0;

const ZIEL = w(1, 'hallo', 'salom');
const ANDERE = [w(2, 'danke', 'rahmat'), w(3, 'ich', 'men'), w(4, 'du', 'sen')];

describe('wortUz', () => {
  it('nemischani so`raydi va to`rt o`zbekcha variant beradi', () => {
    const f = wortUz(ZIEL, ANDERE, rnd)!;
    expect(f.format).toBe('WORT_UZ');
    expect(f.prompt).toBe('hallo');
    expect(f.options).toHaveLength(4);
    expect(f.options).toContain('salom');
    expect(f.richtig).toBe('salom');
  });

  it('chalg`ituvchi yetmasa savol qurmaydi', () => {
    expect(wortUz(ZIEL, ANDERE.slice(0, 1), rnd)).toBeNull();
  });

  it('to`g`ri javobni chalg`ituvchi sifatida takrorlamaydi', () => {
    const f = wortUz(ZIEL, [...ANDERE, w(9, 'hallo', 'salom')], rnd)!;
    expect(f.options.filter((o) => o === 'salom')).toHaveLength(1);
  });

  it('otni artikli bilan ko`rsatadi', () => {
    const f = wortUz(w(5, 'Name', 'ism', 'der'), ANDERE, rnd)!;
    expect(f.prompt).toBe('der Name');
  });

  // Finding 4: to'g'ri javobdan FAQAT tinish belgisi bilan farq qiladigan
  // so'z chalg'ituvchi bo'lsa, `istRichtig` (baholovchi ham `normalisieren`
  // orqali solishtiradi) uni ham TO'G'RI deb hisoblardi — ya'ni savolda
  // ikkita "to'g'ri" variant ko'rinardi.
  //
  // `rnd = () => 0` bu yerda ISHLAMAYDI (`satz-fragen.spec.ts`dagi
  // `reaktion` testidagi izohga qarang): u har doim BIRINCHI elementni
  // navbat oxiriga suradi, ya'ni filtr ishlamasa ham chalg'ituvchi
  // ko'pincha `slice(0, 3)` chetiga chiqib ketardi va test hech narsani
  // isbotlamasdi. `0.9999` esa asl tartibni saqlaydi — shu bilan
  // chalg'ituvchi RO'YXAT BOSHIDA qoladi va filtr ishlamasa `options`da
  // ko'rinadi.
  it('richtigdan faqat tinish belgisi bilan farq qiladigan so`z chalg`ituvchi bo`lmaydi', () => {
    const identityRnd = (): number => 0.9999;
    const birXilMatn = w(50, 'servus', 'salom!');
    const f = wortUz(ZIEL, [birXilMatn, ...ANDERE], identityRnd)!;
    expect(f.options).not.toContain('salom!');
  });

  // Finding 1: `hilfe` avval `ziel.anzeige`ni qaytarardi — raqam so'zida
  // bu aynan javobning o'zi (masalan `acht` uchun `8`). Nemis tilini
  // bilmasa ham raqamni o'qiy oladigan o'quvchi savolni bilim tekshirmay
  // yecha olardi. Endi `hilfe` umuman berilmaydi, `anzeige` faqat
  // materialning o'zida qoladi.
  it('raqam so`zida `hilfe`ga raqam berilmaydi, javob hech qayerda ko`rinmaydi', () => {
    const acht: MaterialWort = {
      id: 10,
      de: 'acht',
      uz: 'sakkiz',
      artikel: null,
      anzeige: '8',
      sectionCode: 'u01-s1',
      audioKey: null,
    };
    const boshqaRaqamlar: MaterialWort[] = [
      {
        id: 11,
        de: 'ich',
        uz: 'men',
        artikel: null,
        anzeige: null,
        sectionCode: 'u01-s1',
        audioKey: null,
      },
      {
        id: 12,
        de: 'drei',
        uz: 'uch',
        artikel: null,
        anzeige: '3',
        sectionCode: 'u01-s1',
        audioKey: null,
      },
      {
        id: 13,
        de: 'neun',
        uz: "to'qqiz",
        artikel: null,
        anzeige: '9',
        sectionCode: 'u01-s1',
        audioKey: null,
      },
    ];
    const f = wortUz(acht, boshqaRaqamlar, rnd)!;
    expect(f.hilfe).toBeNull();
    const hammaMatn = [f.prompt, ...f.options].join(' ');
    expect(hammaMatn).not.toMatch(/\d/);
  });
});

describe('uzWort', () => {
  it('o`zbekchani so`raydi va to`rt nemischa variant beradi', () => {
    const f = uzWort(ZIEL, ANDERE, rnd)!;
    expect(f.format).toBe('UZ_WORT');
    expect(f.prompt).toBe('salom');
    expect(f.options).toContain('hallo');
    expect(f.richtig).toBe('hallo');
  });

  // Finding 2: variantlar `anzeigen` orqali (artikl bilan) ko'rsatilsa,
  // to'rttadan faqat ot bo'lgan so'z ikki so'zli («das Land» kabi) chiqib,
  // javob mazmunidan emas SHAKLIDAN aniqlanib qoladi. Endi hammasi qur'iy.
  it('variantlarning hech biri artikl bilan chiqmaydi, ot sibling bo`lsa ham', () => {
    const ziel = w(1, 'fünf', 'besh');
    const boshqalar = [
      w(2, 'sechs', 'olti'),
      w(3, 'vier', "to'rt"),
      w(4, 'Land', 'davlat', 'das'), // ot — artikli bor
    ];
    const f = uzWort(ziel, boshqalar, rnd)!;
    expect(f.options).toContain('Land');
    for (const variant of f.options) {
      expect(variant).not.toMatch(/^(der|die|das)\s/);
    }
  });

  it('ot uchun artikl shakli endi variant emas, faqat `akzeptiert`da saqlanadi', () => {
    const ziel = w(4, 'Land', 'davlat', 'das');
    const boshqalar = [
      w(1, 'fünf', 'besh'),
      w(2, 'sechs', 'olti'),
      w(3, 'vier', "to'rt"),
    ];
    const f = uzWort(ziel, boshqalar, rnd)!;
    expect(f.options).toContain('Land');
    expect(f.options).not.toContain('das Land');
    expect(f.richtig).toBe('Land');
    expect(f.akzeptiert).toContain('das Land');
  });
});

describe('paar', () => {
  it('to`rt juftni beradi va javob juftlash bo`ladi', () => {
    const f = paar([ZIEL, ...ANDERE], rnd)!;
    expect(f.format).toBe('PAAR');
    expect(f.options).toHaveLength(8);
    // To'g'ri javob — juftliklar ro'yxati, tartibi qat'iy.
    // mischen bilan rnd=>0 shuffle qilingach: [danke, ich, du, hallo]
    expect(f.richtig).toBe('danke=rahmat|ich=men|du=sen|hallo=salom');
  });

  it('to`rttadan kam so`z bo`lsa savol qurmaydi', () => {
    expect(paar([ZIEL, ANDERE[0]], rnd)).toBeNull();
  });

  // Finding 3: `PAAR` to'rtta so'zning tarjimasini birdaniga ko'rsatadi,
  // shuning uchun to'rttasi ham "band" bo'lishi kerak — faqat `itemId`
  // (birinchisi) emas. Aks holda qolgan uchtasi shu seansda yana alohida
  // savol sifatida so'ralishi mumkin edi (masalan `ich=men` PAARda
  // ko'rsatilgandan keyin, `ich` yana WORT_UZ sifatida ham chiqishi).
  it('belegteItems to`rtta so`zning barchasini o`z ichiga oladi', () => {
    const f = paar([ZIEL, ...ANDERE], rnd)!;
    expect(f.belegteItems.sort()).toEqual(
      ['WORT:1', 'WORT:2', 'WORT:3', 'WORT:4'].sort(),
    );
  });

  it('ikkinchi bir xil tarjimali so`zni (ikkinchi SHARED) tashlab, to`rttaga yetkazadi', () => {
    // 6 ta so'z, rnd=0.9999 bilan Fisher-Yates AMALDA hech kimni
    // almashtirmaydi — tartib o'zgarmagan holicha qoladi (identity shuffle):
    // w1 (uz=uz1), w2 (uz=uz2), w3 (uz=SHARED), w4 (uz=SHARED), w5 (uz=uz5), w6 (uz=uz6).
    //
    // Greedy tanlov ketma-ket yuradi: w1 va w2 — tarjimasi hali band emas,
    // TANLANADI. w3 — tarjimasi (SHARED) BIRINCHI marta ko'rinyapti, u ham
    // hali band emas — TANLANADI (birinchi SHARED tashlab ketilmaydi).
    // w4 — tarjimasi ALLAQACHON band (xuddi w3dagi SHARED) — TASHLAB
    // YUBORILADI. w5 — band emas, TANLANADI va to'rttaga yetadi; w6ga
    // hech qachon yetib borilmaydi.
    // Natija: tanlangan to'rtlik — [w1, w2, w3, w5].
    const identityShuffle = (): number => 0.9999;
    const words = [
      w(1, 'word1', 'uz1'),
      w(2, 'word2', 'uz2'),
      w(3, 'word3', 'uz_SHARED'),
      w(4, 'word4', 'uz_SHARED'),
      w(5, 'word5', 'uz5'),
      w(6, 'word6', 'uz6'),
    ];
    const f = paar(words, identityShuffle);
    expect(f).not.toBeNull();
    if (f) {
      const pairs = f.richtig.split('|').map((p) => p.split('='));
      const des = pairs.map((p) => p[0]);
      const uzs = pairs.map((p) => p[1]);
      expect([...new Set(des)]).toHaveLength(4);
      expect([...new Set(uzs)]).toHaveLength(4);
    }
  });

  it('barcha so`zlar bir xil nemischa kelmasa savol qurmaydi', () => {
    const words = [
      w(1, 'Name', 'ism'),
      w(2, 'Name', 'nomi'),
      w(3, 'Name', 'nomi2'),
      w(4, 'Name', 'nomi3'),
    ];
    expect(paar(words, rnd)).toBeNull();
  });

  it('barcha so`zlar bir xil tarjimada savol qurmaydi', () => {
    const words = [
      w(1, 'hallo', 'salom'),
      w(2, 'hey', 'salom'),
      w(3, 'guten', 'salom'),
      w(4, 'morgen', 'salom'),
    ];
    expect(paar(words, rnd)).toBeNull();
  });
});

describe('artikel', () => {
  it('artiklni so`raydi', () => {
    const f = artikel(w(5, 'Name', 'ism', 'der'))!;
    expect(f.format).toBe('ARTIKEL');
    expect(f.prompt).toBe('___ Name');
    expect(f.options).toEqual(['der', 'die', 'das']);
    expect(f.richtig).toBe('der');
  });

  it('artiklsiz so`zga savol qurmaydi', () => {
    expect(artikel(ZIEL)).toBeNull();
  });
});

const mitAudio = (id: number, de: string, uz: string): MaterialWort => ({
  id,
  de,
  uz,
  artikel: null,
  anzeige: null,
  sectionCode: 'u01-s1',
  audioKey: `daf/audio/${id}.mp3`,
});
const ohneAudio = (id: number, de: string, uz: string): MaterialWort => ({
  ...mitAudio(id, de, uz),
  audioKey: null,
});

// Haqiqiy `UebungService.mediaUrl` bilan bir xil qoida
// (`R2_PUBLIC_URL + '/' + kalit`) — bu yerda soxta bazaga qarshi.
const mediaUrl = (key: string): string | null =>
  `https://media.example.com/${key}`;
/** `R2_PUBLIC_URL` sozlanmagan holatni taqlid qiladi. */
const mediaUrlYoq = (): string | null => null;

describe('audioWort', () => {
  it('promptda so`z YO`Q — javob faqat ovozda, audioUrl TO`LIQ manzil', () => {
    // `prompt` mijozga ketadi. Unda so'z tursa, savol eshitishni emas,
    // o'qishni tekshirardi.
    const ziel = mitAudio(1, 'hallo', 'salom');
    const f = audioWort(
      ziel,
      [
        mitAudio(2, 'danke', 'rahmat'),
        mitAudio(3, 'wer', 'kim'),
        mitAudio(4, 'was', 'nima'),
      ],
      () => 0.5,
      mediaUrl,
    );
    expect(f).not.toBeNull();
    expect(f!.prompt).toBe('');
    // Finding 1 (KRITIK): bu ilgari YALANG'OCH R2 kaliti edi
    // (`daf/audio/1.mp3`) — `<audio src>`ga shu holicha ketsa portalning
    // o'z originiga qarshi 404 beradi. Endi to'liq manzil.
    expect(f!.audioUrl).toBe('https://media.example.com/daf/audio/1.mp3');
    expect(f!.options).toHaveLength(4);
    expect(f!.options).toContain('hallo');
    expect(f!.richtig).toBe('hallo');
  });

  it('audiosi yo`q so`zga savol qurilmaydi', () => {
    const ziel = ohneAudio(1, 'hallo', 'salom');
    expect(
      audioWort(
        ziel,
        [
          mitAudio(2, 'danke', 'rahmat'),
          mitAudio(3, 'wer', 'kim'),
          mitAudio(4, 'was', 'nima'),
        ],
        () => 0.5,
        mediaUrl,
      ),
    ).toBeNull();
  });

  it('chalg`ituvchi yetmasa null', () => {
    expect(
      audioWort(
        mitAudio(1, 'hallo', 'salom'),
        [mitAudio(2, 'danke', 'rahmat')],
        () => 0.5,
        mediaUrl,
      ),
    ).toBeNull();
  });

  // Fix 1 qarori: `R2_PUBLIC_URL` sozlanmagan bo'lsa buzuq manzil
  // chiqarish O'RNIGA savol umuman qurilmaydi — audioKey yo'qligi bilan
  // BIR XIL munosabat.
  it('R2_PUBLIC_URL sozlanmagan bo`lsa savol qurilmaydi (buzuq manzil chiqarilmaydi)', () => {
    const ziel = mitAudio(1, 'hallo', 'salom');
    const f = audioWort(
      ziel,
      [
        mitAudio(2, 'danke', 'rahmat'),
        mitAudio(3, 'wer', 'kim'),
        mitAudio(4, 'was', 'nima'),
      ],
      () => 0.5,
      mediaUrlYoq,
    );
    expect(f).toBeNull();
  });
});

describe('wortTippen', () => {
  it('promptda so`z YO`Q va variant berilmaydi, audioUrl TO`LIQ manzil', () => {
    const f = wortTippen(mitAudio(1, 'tschüss', 'xayr'), () => 0.5, mediaUrl);
    expect(f).not.toBeNull();
    expect(f!.prompt).toBe('');
    expect(f!.options).toEqual([]);
    expect(f!.audioUrl).toBe('https://media.example.com/daf/audio/1.mp3');
    expect(f!.richtig).toBe('tschüss');
  });

  it('audiosi yo`q so`zga savol qurilmaydi', () => {
    expect(
      wortTippen(ohneAudio(1, 'tschüss', 'xayr'), () => 0.5, mediaUrl),
    ).toBeNull();
  });

  it('R2_PUBLIC_URL sozlanmagan bo`lsa savol qurilmaydi (buzuq manzil chiqarilmaydi)', () => {
    expect(
      wortTippen(mitAudio(1, 'tschüss', 'xayr'), () => 0.5, mediaUrlYoq),
    ).toBeNull();
  });
});

describe('toPublic', () => {
  it('audioUrl mijozga uzatiladi', () => {
    const f: Frage = {
      format: 'AUDIO_WORT',
      itemType: 'WORT',
      itemId: 1,
      prompt: '',
      hilfe: null,
      options: ['a', 'b', 'c', 'd'],
      richtig: 'a',
      akzeptiert: [],
      audioUrl: 'daf/audio/x.mp3',
      belegteItems: ['WORT:1'],
    };
    expect(toPublic(f, 0).audioUrl).toBe('daf/audio/x.mp3');
  });
});
