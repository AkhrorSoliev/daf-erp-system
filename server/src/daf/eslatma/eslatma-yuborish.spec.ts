jest.mock('./eslatma-auditoriya', () => ({
  kechkiAuditoriya: jest.fn(),
  haftalikAuditoriya: jest.fn(),
}));
jest.mock('./eslatma-jurnali', () => ({
  eslatmaniEgalla: jest.fn(),
  natijaniYoz: jest.fn(),
}));

import { haftalikAuditoriya, kechkiAuditoriya } from './eslatma-auditoriya';
import { eslatmaniEgalla, natijaniYoz } from './eslatma-jurnali';
import { haftalikMatn, toxtatishTugmasi } from './eslatma-matn';
import { EslatmaYuborish, haftalikMalumot } from './eslatma-yuborish';

const kechki = kechkiAuditoriya as jest.Mock;
const haftalik = haftalikAuditoriya as jest.Mock;
const egalla = eslatmaniEgalla as jest.Mock;
const natija = natijaniYoz as jest.Mock;

const AZIZA = {
  studentId: 10001,
  ism: 'Aziza',
  seriya: 5,
  dailyGoal: 'JIDDIY',
};
const BOBUR = { studentId: 10002, ism: 'Bobur', seriya: 0, dailyGoal: null };
const HAFTALIK_QATOR = {
  studentId: 10001,
  ism: 'Aziza',
  ball: 340,
  tier: 0,
  orin: 2,
  kotarildi: true,
  guruhOrin: 3,
  guruhJami: 12,
  nishonlar: ['SERIE_7'],
};

function make() {
  const prisma = {} as any;
  const sms = {
    sendToStudent: jest.fn(async (..._a: unknown[]) => ({ status: 'SENT' })),
  };
  return { prisma, sms, y: new EslatmaYuborish(prisma, sms as any) };
}

describe('EslatmaYuborish — auditoriya → jurnal → sendToStudent', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    natija.mockResolvedValue(undefined);
  });

  it("'off': hech narsa — bazaga ham tegmaydi", async () => {
    const { y, sms } = make();
    const nol = { auditoriya: 0, yuborildi: 0, xato: 0, otkazildi: 0 };
    expect(await y.kechki(1, '2026-10-20', 'off', 0)).toEqual(nol);
    expect(await y.haftalik(1, '2026-10-19', 'off', 0)).toEqual(nol);
    expect(kechki).not.toHaveBeenCalled();
    expect(haftalik).not.toHaveBeenCalled();
    expect(egalla).not.toHaveBeenCalled();
    expect(natija).not.toHaveBeenCalled();
    expect(sms.sendToStudent).not.toHaveBeenCalled();
  });

  it("'log': auditoriya sanaladi, hech narsa egallanmaydi, yuborilmaydi va jurnalga yozilmaydi", async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR]);
    haftalik.mockResolvedValue([HAFTALIK_QATOR]);
    const { y, sms } = make();
    expect(await y.kechki(1, '2026-10-20', 'log', 0)).toEqual({
      auditoriya: 2,
      yuborildi: 0,
      xato: 0,
      otkazildi: 0,
    });
    expect(await y.haftalik(1, '2026-10-19', 'log', 0)).toMatchObject({
      auditoriya: 1,
      yuborildi: 0,
    });
    expect(egalla).not.toHaveBeenCalled();
    expect(natija).not.toHaveBeenCalled();
    expect(sms.sendToStudent).not.toHaveBeenCalled();
  });

  it("'on': har biriga bitta xabar, tugma bilan, kunlik maqsad bilan, natija SENT", async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR]);
    egalla.mockResolvedValueOnce(11).mockResolvedValueOnce(12);
    const { y, sms, prisma } = make();
    expect(await y.kechki(1, '2026-10-20', 'on', 0)).toEqual({
      auditoriya: 2,
      yuborildi: 2,
      xato: 0,
      otkazildi: 0,
    });
    expect(egalla).toHaveBeenCalledWith(prisma, {
      companyId: 1,
      studentId: 10001,
      kind: 'EVENING',
      sentOn: '2026-10-20',
    });
    expect(sms.sendToStudent).toHaveBeenNthCalledWith(
      1,
      10001,
      expect.stringContaining('5 kunlik seriyangiz'),
      'AUTO',
      undefined,
      1,
      { replyMarkup: toxtatishTugmasi(10001) },
    );
    expect(sms.sendToStudent.mock.calls[0][1]).toContain(
      'Bugungi maqsad: 160 ball',
    );
    expect(sms.sendToStudent.mock.calls[1][1]).toContain("Nemis so'zlaringiz");
    expect(sms.sendToStudent.mock.calls[1][1]).toContain(
      'Bugungi maqsad: 80 ball',
    );
    expect(natija.mock.calls).toEqual([
      [prisma, 11, 'SENT'],
      [prisma, 12, 'SENT'],
    ]);
  });

  it("tugma: matni «Eslatmalarni to'xtatish», callback_data dr:off:<id> va 64 baytdan oshmaydi", () => {
    const [[{ text, callback_data }]] = toxtatishTugmasi(10001)
      .inline_keyboard as { text: string; callback_data: string }[][];
    expect(text).toBe("Eslatmalarni to'xtatish");
    expect(callback_data).toBe('dr:off:10001');
    const eng = toxtatishTugmasi(2147483647).inline_keyboard[0][0] as {
      callback_data: string;
    };
    expect(Buffer.byteLength(eng.callback_data)).toBeLessThanOrEqual(64);
  });

  it('egallangan qator (ikkinchi chaqiruv) — yubormaydi', async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR]);
    egalla.mockResolvedValueOnce(null).mockResolvedValueOnce(12);
    const { y, sms } = make();
    expect(await y.kechki(1, '2026-10-20', 'on', 0)).toMatchObject({
      yuborildi: 1,
      otkazildi: 1,
    });
    expect(sms.sendToStudent).toHaveBeenCalledTimes(1);
    expect(sms.sendToStudent.mock.calls[0][0]).toBe(10002);
    expect(natija).toHaveBeenCalledTimes(1);
  });

  it("xatoli o'quvchi qolganlarni to'xtatmaydi; xato ham, FAILED javob ham FAILED", async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR, { ...BOBUR, studentId: 10003 }]);
    egalla
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(13);
    const { y, sms, prisma } = make();
    sms.sendToStudent
      .mockRejectedValueOnce(new Error('chat not found'))
      .mockResolvedValueOnce({ status: 'FAILED' })
      .mockResolvedValueOnce({ status: 'SENT' });
    expect(await y.kechki(1, '2026-10-20', 'on', 0)).toEqual({
      auditoriya: 3,
      yuborildi: 1,
      xato: 2,
      otkazildi: 0,
    });
    expect(natija.mock.calls).toEqual([
      [prisma, 11, 'FAILED'],
      [prisma, 12, 'FAILED'],
      [prisma, 13, 'SENT'],
    ]);
  });

  it('Telegram 429 (sendToStudent FAILED qaytaradi): qator FAILED, qayta urinilmaydi', async () => {
    kechki.mockResolvedValue([AZIZA]);
    egalla.mockResolvedValueOnce(11);
    const { y, sms, prisma } = make();
    sms.sendToStudent.mockResolvedValueOnce({ status: 'FAILED' });
    expect(await y.kechki(1, '2026-10-20', 'on', 0)).toMatchObject({
      yuborildi: 0,
      xato: 1,
    });
    expect(sms.sendToStudent).toHaveBeenCalledTimes(1);
    expect(natija.mock.calls).toEqual([[prisma, 11, 'FAILED']]);
  });

  it("egallashning o'zi yiqilsa ham keyingisi yuboriladi", async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR]);
    egalla
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(12);
    const { y, sms } = make();
    expect(await y.kechki(1, '2026-10-20', 'on', 0)).toMatchObject({
      yuborildi: 1,
      xato: 1,
    });
    expect(sms.sendToStudent).toHaveBeenCalledTimes(1);
  });

  it('haftalik: WEEKLY qatori, ixtiyoriy qatorlar bilan matn', async () => {
    haftalik.mockResolvedValue([HAFTALIK_QATOR]);
    egalla.mockResolvedValueOnce(21);
    const { y, sms, prisma } = make();
    expect(await y.haftalik(1, '2026-10-19', 'on', 0)).toMatchObject({
      auditoriya: 1,
      yuborildi: 1,
    });
    expect(egalla).toHaveBeenCalledWith(prisma, {
      companyId: 1,
      studentId: 10001,
      kind: 'WEEKLY',
      sentOn: '2026-10-19',
    });
    expect(sms.sendToStudent.mock.calls[0][1]).toBe(
      haftalikMatn(haftalikMalumot(HAFTALIK_QATOR)),
    );
    expect(sms.sendToStudent.mock.calls[0][1]).toContain('Kumush ligasiga');
  });

  it('pauza: har yuborishdan keyin kutadi', async () => {
    kechki.mockResolvedValue([AZIZA, BOBUR, { ...BOBUR, studentId: 10003 }]);
    egalla.mockResolvedValue(11);
    const { y } = make();
    const t0 = Date.now();
    await y.kechki(1, '2026-10-20', 'on', 20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
  });

  it("haftalikMalumot: xona yoki o'rin yo'q — liga qatori yo'q; guruh o'rni yo'q — guruh qatori yo'q", () => {
    expect(
      haftalikMalumot({ ...HAFTALIK_QATOR, tier: null, orin: null }).liga,
    ).toBeNull();
    expect(haftalikMalumot({ ...HAFTALIK_QATOR, orin: null }).liga).toBeNull();
    expect(
      haftalikMalumot({ ...HAFTALIK_QATOR, guruhOrin: null }).guruh,
    ).toBeNull();
    expect(haftalikMalumot(HAFTALIK_QATOR)).toEqual({
      ism: 'Aziza',
      ball: 340,
      liga: { tier: 0, orin: 2, kotarildi: true },
      guruh: { orin: 3, jami: 12 },
      nishonlar: ['SERIE_7'],
    });
  });
});
