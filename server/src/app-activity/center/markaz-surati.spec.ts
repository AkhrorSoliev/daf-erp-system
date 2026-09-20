import { STANDART_NORMA } from '../norma/norma';
import { davrOynasi } from '../stats/davr';
import { KunlikSavol, KunlikSeans, oquvchiSurati } from './markaz-surati';

// 2026-09-20, 14:00 Toshkent → bugun '2026-09-20', 7 kunlik davr 14..20.
const NOW = new Date('2026-09-20T09:00:00Z');
const AKKAUNT = new Date('2026-08-01T00:00:00Z');

const seans = (sana: string, lernen: number, kirdi = true): KunlikSeans => ({
  studentId: 10001,
  sana,
  faolSoniya: lernen + 60,
  radioSoniya: 0,
  lernenSoniya: lernen,
  kirdi,
});
const savol = (sana: string, savollar: number, togri: number): KunlikSavol => ({
  studentId: 10001,
  sana,
  savollar,
  togri,
});

describe('oquvchiSurati — kunlik qatorlardan bitta o\'quvchi surati (dizayn 3.3)', () => {
  const oyna = davrOynasi(7, NOW, AKKAUNT, '2026-09-13');

  it('davrning 7 kuni tartib bilan chiqadi, hammasi kuzatilgan', () => {
    const s = oquvchiSurati(oyna, [], [], STANDART_NORMA);
    expect(s.kunlar.map((k) => k.sana)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
      '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
    expect(s.kunlar.every((k) => k.kuzatilgan)).toBe(true);
    expect(s.faolKun).toBe(0);
    expect(s.kirdi).toBe(false);
  });

  it("vaqt yetgan kun ham, savol yetgan kun ham faol; ikkalasi kam bo'lsa faol emas", () => {
    const s = oquvchiSurati(
      oyna,
      [seans('2026-09-14', 600), seans('2026-09-15', 120), seans('2026-09-16', 599)],
      [savol('2026-09-15', 12, 10), savol('2026-09-16', 11, 11)],
      STANDART_NORMA,
    );
    const faol = Object.fromEntries(s.kunlar.map((k) => [k.sana, k.shugullangan]));
    expect(faol['2026-09-14']).toBe(true);  // vaqt
    expect(faol['2026-09-15']).toBe(true);  // savol
    expect(faol['2026-09-16']).toBe(false); // ikkalasi ham bir kam
    expect(s.faolKun).toBe(2);
  });

  it("yig'indilar: LERNEN soniya, savol, to'g'ri, kirdi", () => {
    const s = oquvchiSurati(
      oyna,
      [seans('2026-09-14', 600), seans('2026-09-18', 300, false)],
      [savol('2026-09-14', 12, 9), savol('2026-09-18', 5, 5)],
      STANDART_NORMA,
    );
    expect(s.lernenSoniya).toBe(900);
    expect(s.faolSoniya).toBe(1020);
    expect(s.savollar).toBe(17);
    expect(s.togri).toBe(14);
    expect(s.kirdi).toBe(true);
    expect(s.kunlar.find((k) => k.sana === '2026-09-18')?.kirdi).toBe(false);
    expect(s.kunlar.find((k) => k.sana === '2026-09-14')?.savollar).toBe(12);
  });

  it("hisob boshidan oldingi kun kuzatilmagan — faol kunga ham, yig'indiga ham kirmaydi", () => {
    // Akkaunt 17-sentabrda ochilgan: 14..16 kuzatilmagan, maxraj 4.
    const kech = davrOynasi(7, NOW, new Date('2026-09-17T05:00:00Z'), '2026-09-13');
    expect(kech.maxraj).toBe(4);
    const s = oquvchiSurati(
      kech,
      [seans('2026-09-15', 900), seans('2026-09-18', 900)],
      [],
      STANDART_NORMA,
    );
    expect(s.kunlar.find((k) => k.sana === '2026-09-15')?.kuzatilgan).toBe(false);
    expect(s.kunlar.find((k) => k.sana === '2026-09-15')?.shugullangan).toBe(false);
    expect(s.faolKun).toBe(1);
    expect(s.lernenSoniya).toBe(900);
  });

  it("davrdan tashqari sana kelsa e'tiborsiz qoladi", () => {
    const s = oquvchiSurati(oyna, [seans('2026-09-01', 900)], [], STANDART_NORMA);
    expect(s.faolKun).toBe(0);
    expect(s.lernenSoniya).toBe(0);
  });
});
