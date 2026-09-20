import { GuruhAzoligi, OquvchiHisobi } from './center-app-activity.types';
import {
  filtrla,
  filtrVariantlari,
  korsatiladiganGuruh,
  sahifala,
  sarala,
} from './markaz-royxat';

const guruh = (id: string, nomi: string, daraja: 'A1' | 'A2' | 'B1' | null, oqituvchiId = 20001): GuruhAzoligi => ({
  id,
  nomi,
  daraja,
  boshlanish: '2026-09-01T00:00:00.000Z',
  oqituvchilar: [{ id: oqituvchiId, ism: `O'qituvchi ${oqituvchiId}` }],
});

function hisob(qism: Partial<OquvchiHisobi>): OquvchiHisobi {
  return {
    studentId: 10001,
    ism: 'Nodira Yusupova',
    photo: null,
    telefon: '901112233',
    otaOnaTelefoni: null,
    akkaunt: true,
    hechKirmagan: false,
    kirdi: true,
    holat: 'YASHIL',
    faolKun: 5,
    maxraj: 7,
    hisobBoshi: '2026-09-14',
    kerakliKun: 4,
    sariqKerak: 2,
    kunlar: [],
    kun30: [],
    lernenSoniya: 3600,
    savollar: 40,
    togri: 30,
    foiz: 75,
    tugatilganDarslar: 2,
    oxirgiFaollik: { vaqt: '2026-09-20T05:00:00.000Z', platforma: 'WEB' },
    guruhlar: [guruh('g-a1', 'A1-07', 'A1')],
    filial: { id: 1, nomi: 'Filial A' },
    ...qism,
  };
}

const HECH = hisob({ studentId: 1, ism: 'Bekzod', holat: 'HECH_KIRMAGAN', kirdi: false, faolKun: 0, oxirgiFaollik: null });
const QIZIL_ESKI = hisob({ studentId: 2, ism: 'Aziza', holat: 'QIZIL', kirdi: false, faolKun: 0, oxirgiFaollik: { vaqt: '2026-08-01T05:00:00.000Z', platforma: 'WEB' } });
const QIZIL_YANGI = hisob({ studentId: 3, ism: 'Dilnoza', holat: 'QIZIL', kirdi: true, faolKun: 1, oxirgiFaollik: { vaqt: '2026-09-19T05:00:00.000Z', platforma: 'WEB' } });
const SARIQ = hisob({ studentId: 4, ism: 'Sardor', holat: 'SARIQ', faolKun: 3, foiz: null, savollar: 0, togri: 0 });
const YASHIL = hisob({ studentId: 5, ism: 'Malika', holat: 'YASHIL', faolKun: 6, lernenSoniya: 7200, guruhlar: [guruh('g-a2', 'A2-01', 'A2', 20002)], telefon: '935556677', otaOnaTelefoni: '901234567' });
const AKKAUNTSIZ = hisob({ studentId: 6, ism: 'Zafar', akkaunt: false, holat: 'AKKAUNT_YOQ', kirdi: false, faolKun: 0, oxirgiFaollik: null });
const HAMMA = [YASHIL, AKKAUNTSIZ, SARIQ, QIZIL_YANGI, HECH, QIZIL_ESKI];

describe('sarala — standart tartib (dizayn 6.2)', () => {
  it("holat: hech kirmagan → qizil (eng eski kirish oldin) → sariq → yashil → akkaunt yo'q", () => {
    expect(sarala(HAMMA, 'holat', 'asc').map((h) => h.ism)).toEqual([
      'Bekzod', 'Aziza', 'Dilnoza', 'Sardor', 'Malika', 'Zafar',
    ]);
  });

  it('desc tartibni teskari qiladi', () => {
    expect(sarala(HAMMA, 'holat', 'desc')[0].ism).toBe('Zafar');
  });

  it("vaqt bo'yicha desc — eng ko'p LERNEN yuqorida", () => {
    expect(sarala(HAMMA, 'vaqt', 'desc')[0].ism).toBe('Malika');
  });

  it("foiz: null eng pastda (asc da boshida) — Sardor", () => {
    expect(sarala(HAMMA, 'foiz', 'asc')[0].ism).toBe('Sardor');
  });

  it("oxirgi: hech qachon kirmaganlar eng yuqorida, keyin eng eskisi", () => {
    const tartib = sarala(HAMMA, 'oxirgi', 'asc').map((h) => h.ism);
    expect(tartib.slice(0, 2).sort()).toEqual(['Bekzod', 'Zafar']);
    expect(tartib[2]).toBe('Aziza');
  });

  it("kirishni o'zgartirmaydi", () => {
    const nusxa = [...HAMMA];
    sarala(HAMMA, 'ism', 'asc');
    expect(HAMMA).toEqual(nusxa);
  });
});

describe('filtrla (dizayn 6.1)', () => {
  it('holat ro\'yxati — bir nechtasi birga', () => {
    expect(filtrla(HAMMA, { status: ['QIZIL', 'SARIQ'] }).map((h) => h.studentId).sort()).toEqual([2, 3, 4]);
  });

  it("kirgan=false — davrda kirmaganlar (hech kirmagan, eski qizil, akkauntsiz)", () => {
    expect(filtrla(HAMMA, { kirgan: false }).map((h) => h.studentId).sort()).toEqual([1, 2, 6]);
  });

  it("guruh, o'qituvchi, daraja — istalgan faol guruh mos kelsa", () => {
    expect(filtrla(HAMMA, { groupId: 'g-a2' }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { teacherId: 20002 }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { level: 'A2' }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { level: 'B1' })).toEqual([]);
  });

  it("qidiruv: ism bo'yicha katta-kichik harfsiz, telefon bo'yicha raqamlar", () => {
    expect(filtrla(HAMMA, { q: 'mali' }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { q: '93 555' }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { q: '9012345' }).map((h) => h.ism)).toEqual(['Malika']); // ota-ona telefoni
  });

  it("ikki xonali raqam telefonga mos deb olinmaydi", () => {
    // '90' hamma telefonda bor — ism bo'yicha ham mos kelmasa bo'sh.
    expect(filtrla(HAMMA, { q: '90' })).toEqual([]);
  });

  it("bo'sh filtr hammani qaytaradi", () => {
    expect(filtrla(HAMMA, {})).toHaveLength(6);
  });
});

describe('sahifala', () => {
  it('50 talik sahifa, raqam chegaradan oshsa oxirgisiga qirqiladi', () => {
    const royxat = Array.from({ length: 120 }, (_, i) => i);
    expect(sahifala(royxat, 1, 50).qatorlar).toHaveLength(50);
    expect(sahifala(royxat, 3, 50).qatorlar).toHaveLength(20);
    expect(sahifala(royxat, 9, 50)).toMatchObject({ jami: 120, sahifa: 3 });
    expect(sahifala([], 1, 50)).toEqual({ jami: 0, sahifa: 1, qatorlar: [] });
  });
});

describe('filtrVariantlari va korsatiladiganGuruh', () => {
  it("guruhlar va o'qituvchilar takrorsiz, ism bo'yicha; darajalar mavjudlari", () => {
    const v = filtrVariantlari(HAMMA);
    expect(v.guruhlar).toEqual([{ id: 'g-a1', nomi: 'A1-07' }, { id: 'g-a2', nomi: 'A2-01' }]);
    expect(v.oqituvchilar.map((o) => o.id)).toEqual([20001, 20002]);
    expect(v.darajalar).toEqual(['A1', 'A2']);
  });

  it("filtr guruhi bo'lsa o'sha, bo'lmasa birinchi (eng erta) guruh", () => {
    const ikki = hisob({ guruhlar: [guruh('g-1', 'B', 'A1'), guruh('g-2', 'A', 'A2')] });
    expect(korsatiladiganGuruh(ikki, 'g-2')?.id).toBe('g-2');
    expect(korsatiladiganGuruh(ikki)?.id).toBe('g-1');
    expect(korsatiladiganGuruh(hisob({ guruhlar: [] }))).toBeNull();
  });
});
