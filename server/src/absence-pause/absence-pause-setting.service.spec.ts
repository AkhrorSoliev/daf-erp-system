import { BadRequestException } from '@nestjs/common';
import { AbsencePauseSettingService } from './absence-pause-setting.service';

describe('AbsencePauseSettingService', () => {
  const companyId = 1001;

  function makeService(existing: Record<string, unknown> | null) {
    const prisma = {
      absencePauseSetting: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Record<string, unknown> }) => ({
              warnThreshold: 2,
              pauseThreshold: 3,
              dailyCap: 10,
              ...data,
            }),
          ),
        update: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Record<string, unknown> }) => ({
              ...existing,
              ...data,
            }),
          ),
      },
    };
    const entityHistoryService = { recordUpdate: jest.fn() };
    return {
      service: new AbsencePauseSettingService(
        prisma as never,
        entityHistoryService as never,
      ),
      prisma,
      entityHistoryService,
    };
  }

  const current = {
    companyId,
    enabled: false,
    warnThreshold: 2,
    pauseThreshold: 3,
    dailyCap: 10,
  };

  it("qator yo'q bo'lsa O'CHIQ holda yaratadi", async () => {
    // Migratsiya o'z-o'zidan hech kimni muzlatmasligi kerak — yoqish
    // CEO ning ongli qadami.
    const { service, prisma } = makeService(null);
    const s = await service.get(companyId);
    expect(s).toEqual({
      enabled: false,
      warnThreshold: 2,
      pauseThreshold: 3,
      dailyCap: 10,
    });
    expect(prisma.absencePauseSetting.create).toHaveBeenCalledWith({
      data: { companyId, enabled: false },
    });
  });

  it('mavjud qatorni qaytaradi va ikkinchi marta yaratmaydi', async () => {
    const { service, prisma } = makeService({
      ...current,
      enabled: true,
      pauseThreshold: 4,
      dailyCap: 25,
    });
    const s = await service.get(companyId);
    expect(s).toEqual({
      enabled: true,
      warnThreshold: 2,
      pauseThreshold: 4,
      dailyCap: 25,
    });
    expect(prisma.absencePauseSetting.create).not.toHaveBeenCalled();
  });

  it("ogohlantirish chegarasi pauza chegarasidan kichik bo'lishi shart", async () => {
    // Teng bo'lsa ogohlantirish pauza bilan bir kunda ketadi va ma'nosi
    // qolmaydi — o'quvchi xabarni muzlatilgandan KEYIN olardi.
    const { service } = makeService(current);
    await expect(
      service.update(companyId, { warnThreshold: 3 }, 10001),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bitta maydonni yangilaganda qolganlariga tegmaydi', async () => {
    const { service, prisma, entityHistoryService } = makeService(current);
    await service.update(companyId, { enabled: true }, 10001);
    expect(prisma.absencePauseSetting.update).toHaveBeenCalledWith({
      where: { companyId },
      data: { updatedById: 10001, enabled: true },
    });
    // Bu tugma pul oqimini to'xtatadi — kim yoqib-o'chirgani yozilsin.
    expect(entityHistoryService.recordUpdate).toHaveBeenCalled();
  });

  it('ikkala chegarani birga oshirsa qabul qiladi', async () => {
    const { service } = makeService(current);
    await expect(
      service.update(companyId, { warnThreshold: 3, pauseThreshold: 5 }, 10001),
    ).resolves.toBeDefined();
  });
});
