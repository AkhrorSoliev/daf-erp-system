import { AbsenceAutoPauseCronService } from './absence-auto-pause.cron.service';

describe('AbsenceAutoPauseCronService.runForCompany', () => {
  const companyId = 1001;

  function streak(studentId: number, count: number) {
    return {
      enrollmentId: `e-${studentId}`,
      studentId,
      groupId: `g-${studentId}`,
      consecutiveAbsentCount: count,
      lastAbsenceDate: new Date('2026-09-18T00:00:00.000Z'),
      lastPresentDate: null,
    };
  }

  function makeService(
    settings: {
      enabled: boolean;
      warnThreshold: number;
      pauseThreshold: number;
      dailyCap: number;
    },
    streaks: ReturnType<typeof streak>[],
    overrides: {
      pauseForAbsence?: jest.Mock;
      warnedAlready?: string[];
    } = {},
  ) {
    const settingService = { get: jest.fn().mockResolvedValue(settings) };
    const streakService = {
      computeStreaks: jest.fn().mockResolvedValue(streaks),
    };
    const statusService = {
      pauseForAbsence:
        overrides.pauseForAbsence ?? jest.fn().mockResolvedValue(undefined),
    };
    const notify = {
      warnStudent: jest.fn().mockResolvedValue(true),
      announcePause: jest.fn().mockResolvedValue(undefined),
      alertCeos: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      absenceWarningLog: {
        findMany: jest.fn().mockResolvedValue(
          (overrides.warnedAlready ?? []).map((id) => ({
            enrollmentId: id,
          })),
        ),
        create: jest.fn().mockResolvedValue({}),
      },
      enrollment: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(
            streaks
              .filter((s) => where.id.in.includes(s.enrollmentId))
              .map((s) => ({
                id: s.enrollmentId,
                studentId: s.studentId,
                groupId: s.groupId,
                student: {
                  id: s.studentId,
                  firstName: 'Ali',
                  lastName: 'Valiyev',
                  telegramChatId: '123',
                },
                group: {
                  id: s.groupId,
                  name: '#001',
                  branchId: 1,
                  teachers: [{ teacherId: 500 }],
                },
              })),
          ),
        ),
      },
      company: { findMany: jest.fn().mockResolvedValue([{ id: companyId }]) },
    };
    const service = new AbsenceAutoPauseCronService(
      prisma as never,
      settingService as never,
      streakService as never,
      statusService as never,
      notify as never,
    );
    return {
      service,
      settingService,
      streakService,
      statusService,
      notify,
      prisma,
    };
  }

  const on = {
    enabled: true,
    warnThreshold: 2,
    pauseThreshold: 3,
    dailyCap: 10,
  };

  it("o'chiq bo'lsa bazaga umuman murojaat qilmaydi", async () => {
    const { service, streakService, statusService } = makeService(
      { ...on, enabled: false },
      [streak(10001, 5)],
    );
    const r = await service.runForCompany(companyId);
    expect(r).toEqual({ paused: 0, warned: 0, blockedByCap: false });
    expect(streakService.computeStreaks).not.toHaveBeenCalled();
    expect(statusService.pauseForAbsence).not.toHaveBeenCalled();
  });

  it("sanoq BITTA so'rovda, ogohlantirish chegarasidan boshlab olinadi", async () => {
    const { service, streakService } = makeService(on, []);
    await service.runForCompany(companyId);
    expect(streakService.computeStreaks).toHaveBeenCalledTimes(1);
    expect(streakService.computeStreaks).toHaveBeenCalledWith({
      companyId,
      threshold: 2,
    });
  });

  it('pauza va ogohlantirishni chegaraga qarab ajratadi', async () => {
    const { service, statusService, notify } = makeService(on, [
      streak(10001, 3),
      streak(10002, 4),
      streak(10003, 2),
    ]);
    const r = await service.runForCompany(companyId);
    expect(r).toEqual({ paused: 2, warned: 1, blockedByCap: false });
    expect(statusService.pauseForAbsence).toHaveBeenCalledTimes(2);
    expect(notify.announcePause).toHaveBeenCalledTimes(2);
    expect(notify.warnStudent).toHaveBeenCalledTimes(1);
  });

  it('chegaradan oshganda HECH KIM pauza qilinmaydi, CEO xabar oladi', async () => {
    // Fail-closed: davomat noto'g'ri kiritilgan kun yuzlab o'quvchini
    // muzlatib qo'yishi mumkin, va qaytarish yuz marta tugma bosish degani.
    const many = Array.from({ length: 11 }, (_, i) => streak(10001 + i, 3));
    const { service, statusService, notify } = makeService(
      { ...on, dailyCap: 10 },
      many,
    );
    const r = await service.runForCompany(companyId);
    expect(r.blockedByCap).toBe(true);
    expect(r.paused).toBe(0);
    expect(statusService.pauseForAbsence).not.toHaveBeenCalled();
    expect(notify.alertCeos).toHaveBeenCalledWith(
      companyId,
      expect.stringContaining('11'),
    );
  });

  it('chegara oshsa ham OGOHLANTIRISHLAR yuboriladi', async () => {
    const many = [
      ...Array.from({ length: 11 }, (_, i) => streak(10001 + i, 3)),
      streak(20001, 2),
    ];
    const { service, notify } = makeService({ ...on, dailyCap: 10 }, many);
    const r = await service.runForCompany(companyId);
    expect(r.blockedByCap).toBe(true);
    expect(r.warned).toBe(1);
    expect(notify.warnStudent).toHaveBeenCalledTimes(1);
  });

  it('bitta pauza yiqilsa qolganlari davom etadi va xato jim qolmaydi', async () => {
    const pauseForAbsence = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    const { service, notify } = makeService(
      on,
      [streak(10001, 3), streak(10002, 3)],
      { pauseForAbsence },
    );
    const r = await service.runForCompany(companyId);
    expect(r.paused).toBe(1);
    expect(notify.alertCeos).toHaveBeenCalledWith(
      companyId,
      expect.stringContaining('xatolik'),
    );
  });

  it('bir qoldirish uchun ikkinchi ogohlantirish ketmaydi', async () => {
    const { service, notify, prisma } = makeService(on, [streak(10001, 2)], {
      warnedAlready: ['e-10001'],
    });
    const r = await service.runForCompany(companyId);
    expect(r.warned).toBe(0);
    expect(notify.warnStudent).not.toHaveBeenCalled();
    expect(prisma.absenceWarningLog.create).not.toHaveBeenCalled();
  });

  it('yuborilgan ogohlantirish jurnalga yoziladi', async () => {
    const { service, prisma } = makeService(on, [streak(10001, 2)]);
    await service.runForCompany(companyId);
    expect(prisma.absenceWarningLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enrollmentId: 'e-10001',
        studentId: 10001,
        absenceDate: new Date('2026-09-18T00:00:00.000Z'),
        streak: 2,
        sentToStudent: true,
        companyId,
      }),
    });
  });

  it('pauzagacha qolgan darslar soni xabarga uzatiladi', async () => {
    const { service, notify } = makeService(
      { ...on, warnThreshold: 2, pauseThreshold: 5 },
      [streak(10001, 3)],
    );
    await service.runForCompany(companyId);
    expect(notify.warnStudent).toHaveBeenCalledWith(
      expect.objectContaining({ streak: 3 }),
      2,
    );
  });
});
