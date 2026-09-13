import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppActivityWriteService } from './app-activity-write.service';

const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
const ctx = { studentId: 55, companyId: 1 };
// 2026-09-13 15:00 Toshkent
const NOW = new Date('2026-09-13T10:00:00.000Z');
const dto = {
  sessionId: UUID,
  platform: 'WEB' as const,
  activeSeconds: 60,
  radioSeconds: 20,
  sections: { LERNEN: 40, OTHER: 20 },
};

function fakePrisma(mavjud: Record<string, unknown> | null = null) {
  const p: any = {
    studentAppSession: {
      findUnique: jest.fn(async () => mavjud),
      create: jest.fn(async (a: any) => a.data),
      update: jest.fn(async (a: any) => a.data),
    },
    studentBranch: { findFirst: jest.fn(async () => ({ branchId: 7 })) },
    enrollment: { findFirst: jest.fn(async () => null) },
    $queryRaw: jest.fn(async () => []),
  };
  p.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(p));
  return p;
}

function seans(ortiqcha: Record<string, unknown> = {}) {
  return {
    studentId: 55,
    day: new Date('2026-09-13T00:00:00.000Z'),
    firstSeenAt: new Date('2026-09-13T09:50:00.000Z'),
    activeSeconds: 300,
    radioSeconds: 100,
    sections: { LERNEN: 200, OTHER: 100 },
    appVersion: null,
    ...ortiqcha,
  };
}

describe('AppActivityWriteService.heartbeat', () => {
  it('yangi seans: Toshkent kuni, firstSeenAt, muhrlangan filial bilan yaratiladi', async () => {
    const prisma = fakePrisma(null);
    const r = await new AppActivityWriteService(prisma).heartbeat(
      dto,
      ctx,
      NOW,
    );
    const data = prisma.studentAppSession.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      id: UUID,
      studentId: 55,
      companyId: 1,
      branchId: 7,
      platform: 'WEB',
      appVersion: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
      activeSeconds: 60,
      radioSeconds: 20,
      sections: { LERNEN: 40, OTHER: 20 },
    });
    expect(data.day.toISOString()).toBe('2026-09-13T00:00:00.000Z');
    expect(r).toEqual({ activeSeconds: 60, radioSeconds: 20 });
    expect(prisma.studentAppSession.update).not.toHaveBeenCalled();
  });

  it('Toshkent yarim tunidan keyin UTC hali kechagi kun bo`lsa ham kun Toshkentniki', async () => {
    const prisma = fakePrisma(null);
    // 2026-09-13T19:30Z = 14-sentabr 00:30 Toshkent
    await new AppActivityWriteService(prisma).heartbeat(
      dto,
      ctx,
      new Date('2026-09-13T19:30:00.000Z'),
    );
    const data = prisma.studentAppSession.create.mock.calls[0][0].data;
    expect(data.day.toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });

  it('o`z seansi: qator qulflanadi, max va soat bilan yangilanadi', async () => {
    const prisma = fakePrisma(seans());
    const r = await new AppActivityWriteService(prisma).heartbeat(
      {
        ...dto,
        activeSeconds: 900,
        radioSeconds: 50,
        sections: { LERNEN: 100, OTHER: 700 },
      },
      ctx,
      NOW,
    );
    expect(prisma.$queryRaw).toHaveBeenCalled();
    const upd = prisma.studentAppSession.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: UUID });
    // firstSeenAt dan 600 s o'tgan → ship 720; active max(300,900)=900 → 720; radio max(100,50)=100
    expect(upd.data).toMatchObject({
      lastSeenAt: NOW,
      activeSeconds: 720,
      radioSeconds: 100,
    });
    // LERNEN 200, OTHER 700 → 900 > 720 → koef 0.8
    expect(upd.data.sections).toEqual({ LERNEN: 160, OTHER: 560 });
    expect(r).toEqual({ activeSeconds: 720, radioSeconds: 100 });
    expect(prisma.studentAppSession.create).not.toHaveBeenCalled();
  });

  it('begona seans — 403, hech narsa yozilmaydi', async () => {
    const prisma = fakePrisma(seans({ studentId: 99 }));
    await expect(
      new AppActivityWriteService(prisma).heartbeat(dto, ctx, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.studentAppSession.update).not.toHaveBeenCalled();
  });

  it('kechagi seans — 409, hech narsa yozilmaydi', async () => {
    const prisma = fakePrisma(
      seans({ day: new Date('2026-09-12T00:00:00.000Z') }),
    );
    await expect(
      new AppActivityWriteService(prisma).heartbeat(dto, ctx, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.studentAppSession.update).not.toHaveBeenCalled();
  });

  it('bir vaqtda ikki birinchi so`rov (P2002): ikkinchisi yangilash yo`liga o`tadi', async () => {
    const prisma = fakePrisma(null);
    let chaqiruv = 0;
    prisma.studentAppSession.findUnique = jest.fn(async () =>
      chaqiruv++ === 0 ? null : seans(),
    );
    prisma.studentAppSession.create = jest.fn(async () => {
      throw new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
    });
    await new AppActivityWriteService(prisma).heartbeat(dto, ctx, NOW);
    expect(prisma.studentAppSession.update).toHaveBeenCalled();
  });

  it('P2002 bo`lmagan yaratish xatosi yuqoriga chiqadi', async () => {
    const prisma = fakePrisma(null);
    prisma.studentAppSession.create = jest.fn(async () => {
      throw new Error('DB down');
    });
    await expect(
      new AppActivityWriteService(prisma).heartbeat(dto, ctx, NOW),
    ).rejects.toThrow('DB down');
  });
});
