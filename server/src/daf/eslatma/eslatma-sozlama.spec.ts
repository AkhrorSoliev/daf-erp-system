import { eslatmalarniSaqla } from './eslatma-sozlama';

describe('eslatmalarniSaqla — remindersEnabled ning yagona yozuvchisi', () => {
  it("upsert: qator yo'q bo'lsa yaratadi, bor bo'lsa faqat remindersEnabled — dailyGoal ga tegmaydi", async () => {
    const upsert = jest.fn(async () => ({ remindersEnabled: false }));
    const r = await eslatmalarniSaqla(
      { dafStudentSetting: { upsert } } as never,
      10001,
      1,
      false,
    );
    expect(r).toEqual({ eslatmalar: false });
    expect(upsert).toHaveBeenCalledWith({
      where: { studentId: 10001 },
      create: { studentId: 10001, companyId: 1, remindersEnabled: false },
      update: { remindersEnabled: false },
      select: { remindersEnabled: true },
    });
  });

  it('javob bazadagi qiymat', async () => {
    const upsert = jest.fn(async () => ({ remindersEnabled: true }));
    expect(
      await eslatmalarniSaqla(
        { dafStudentSetting: { upsert } } as never,
        10001,
        1,
        true,
      ),
    ).toEqual({ eslatmalar: true });
  });
});
