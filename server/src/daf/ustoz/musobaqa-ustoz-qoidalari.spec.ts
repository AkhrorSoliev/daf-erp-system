import {
  haftalarRoyxati,
  haftaniTanla,
  mashqQilmaganlar,
  oquvchiQatorlari,
} from './musobaqa-ustoz-qoidalari';
import type { AzoMalumoti } from './musobaqa-ustoz.types';

const JORIY = '2026-10-19'; // dushanba

describe('haftalarRoyxati', () => {
  it('joriy hafta + oldingi 8 dushanba, yangidan eskiga', () => {
    const r = haftalarRoyxati(JORIY);
    expect(r).toHaveLength(9);
    expect(r[0]).toBe('2026-10-19');
    expect(r[1]).toBe('2026-10-12');
    expect(r[8]).toBe('2026-08-24');
  });
});

describe('haftaniTanla', () => {
  it.each([
    [undefined, '2026-10-19'],
    ['2026-10-19', '2026-10-19'],
    ['2026-08-24', '2026-08-24'],
  ])('%s → %s', (param, kutilgan) => {
    expect(haftaniTanla(param, JORIY)).toBe(kutilgan);
  });

  it.each([
    ['2026-10-20'], // dushanba emas
    ['2026-10-26'], // kelajak
    ['2026-08-17'], // 9 hafta oldin — chegaradan tashqari
    ['bugun'],
  ])('%s → null', (param) => {
    expect(haftaniTanla(param, JORIY)).toBeNull();
  });
});

describe('mashqQilmaganlar', () => {
  it('faqat jami ball 0 bo‘lganlar', () => {
    const r = mashqQilmaganlar([
      { id: 1, jamiBall: 0 },
      { id: 2, jamiBall: 5 },
    ]);
    expect(r.map((x) => x.id)).toEqual([1]);
  });
});

describe('oquvchiQatorlari', () => {
  const azo = (
    id: number,
    ism: string,
    o: Partial<AzoMalumoti> = {},
  ): AzoMalumoti => ({
    studentId: id,
    ism,
    akkaunt: true,
    tier: 0,
    dailyGoal: null,
    nishonlar: 0,
    ...o,
  });

  it('joriy hafta: seriya, bugungi ball, maqsad; jami ball ↓ keyin ism ↑', () => {
    const r = oquvchiQatorlari({
      azolar: [
        azo(1, 'Vali Aliyev'),
        azo(2, 'Anvar Karimov', { tier: 2, dailyGoal: 'JIDDIY', nishonlar: 3 }),
        azo(3, 'Bobur Aliyev'),
      ],
      ballar: [
        { studentId: 1, guruhBali: 50, jamiBall: 80, faolKunlar: 2 },
        { studentId: 2, guruhBali: 10, jamiBall: 80, faolKunlar: 1 },
      ],
      kunlar: [
        {
          studentId: 1,
          tage: ['2026-10-17', '2026-10-18', '2026-10-19'],
          bugunBali: 30,
        },
        { studentId: 2, tage: ['2026-10-10'], bugunBali: 0 },
      ],
      joriy: true,
      bugun: '2026-10-19',
    });
    expect(r.map((x) => x.studentId)).toEqual([2, 1, 3]); // teng 80: Anvar < Vali
    const vali = r.find((x) => x.studentId === 1)!;
    expect(vali).toMatchObject({
      guruhBali: 50,
      jamiBall: 80,
      faolKunlar: 2,
      seriya: 3,
      bugunBali: 30,
      maqsadBali: 80, // tanlov yo'q = O'rta
      liga: 'Bronza',
      oxirgiMashq: '2026-10-19',
    });
    const anvar = r.find((x) => x.studentId === 2)!;
    expect(anvar).toMatchObject({
      maqsadBali: 160,
      liga: 'Oltin',
      nishonlar: 3,
      seriya: 0,
      oxirgiMashq: '2026-10-10',
    });
  });

  it('qatori yo‘q o‘quvchi nollar bilan, oxirgi mashq null', () => {
    const [q] = oquvchiQatorlari({
      azolar: [azo(7, 'Yangi Kelgan')],
      ballar: [],
      kunlar: [],
      joriy: true,
      bugun: '2026-10-19',
    });
    expect(q).toMatchObject({
      guruhBali: 0,
      jamiBall: 0,
      faolKunlar: 0,
      seriya: 0,
      bugunBali: 0,
      oxirgiMashq: null,
    });
  });

  it('o‘tgan hafta: seriya, bugungi ball va maqsad null', () => {
    const [q] = oquvchiQatorlari({
      azolar: [azo(1, 'Vali Aliyev')],
      ballar: [{ studentId: 1, guruhBali: 5, jamiBall: 5, faolKunlar: 1 }],
      kunlar: [{ studentId: 1, tage: ['2026-10-18'], bugunBali: 0 }],
      joriy: false,
      bugun: '2026-10-19',
    });
    expect(q).toMatchObject({
      seriya: null,
      bugunBali: null,
      maqsadBali: null,
      oxirgiMashq: '2026-10-18',
    });
  });
});
