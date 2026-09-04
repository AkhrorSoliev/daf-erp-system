import { artikel, paar, uzWort, wortUz } from './wort-fragen';
import type { MaterialWort } from './frage.types';

function w(id: number, de: string, uz: string, art: string | null = null): MaterialWort {
  return { id, de, uz, artikel: art, anzeige: null, sectionCode: 'u01-s1' };
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
});

describe('uzWort', () => {
  it('o`zbekchani so`raydi va to`rt nemischa variant beradi', () => {
    const f = uzWort(ZIEL, ANDERE, rnd)!;
    expect(f.format).toBe('UZ_WORT');
    expect(f.prompt).toBe('salom');
    expect(f.options).toContain('hallo');
    expect(f.richtig).toBe('hallo');
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

  it('birinchi to`rtda dublikat bo`lsa greedy tanlab topadi', () => {
    // 6 ta so'z: birinchi 2 ta normal, keyingi 2 ta bir xil uz, oxirgi 2 ta normal.
    // rnd=>0 shuffle: left-rotate-by-one → [i2, i3, i4, i5, i6, i1]
    // Sliding window [0-3]: i2, i3(uzDUP), i4(uzDUP), i5 → DUP fail
    // Greedy tanla: i2, i3(add), skip i4(uzDUP used), i5, i6 → 4 ta tufa
    const words = [
      w(1, 'hallo', 'salom'),
      w(2, 'danke', 'rahmat'),
      w(3, 'ichka', 'sameTrans1'),
      w(4, 'sehr', 'sameTrans1'),
      w(5, 'du', 'sen'),
      w(6, 'ich', 'men'),
    ];
    const f = paar(words, rnd);
    expect(f).not.toBeNull();
    if (f) {
      const pairs = f.richtig.split('|').map((p) => p.split('='));
      const des = pairs.map((p) => p[0]);
      const uzs = pairs.map((p) => p[1]);
      expect([...new Set(des)]).toHaveLength(4);
      expect([...new Set(uzs)]).toHaveLength(4);
    }
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
