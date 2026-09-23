import { AbsenceAutoPauseCronService } from './absence-auto-pause.cron.service';

describe('AbsenceAutoPauseCronService', () => {
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
      nudgeStudent: jest.fn().mockResolvedValue(true),
      warnStudent: jest.fn().mockResolvedValue(true),
      announcePause: jest.fn().mockResolvedValue(undefined),
      alertCeos: jest.fn().mockResolvedValue(undefined),
    };
    // Behaves like the table's unique key (enrollmentId, absenceDate): a row
    // written by one run is seen by the next, so the evening and morning runs
    // can be checked together. `warnedAlready` seeds entries for any date.
    type LogKey = { enrollmentId: string; absenceDate: Date };
    const written: LogKey[] = [];
    const prisma = {
      absenceWarningLog: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: { where: { OR: LogKey[] } }) =>
            Promise.resolve([
              ...(overrides.warnedAlready ?? []).map((id) => ({
                enrollmentId: id,
              })),
              ...written
                .filter((w) =>
                  where.OR.some(
                    (o) =>
                      o.enrollmentId === w.enrollmentId &&
                      o.absenceDate.getTime() === w.absenceDate.getTime(),
                  ),
                )
                .map((w) => ({ enrollmentId: w.enrollmentId })),
            ]),
          ),
        create: jest.fn().mockImplementation(({ data }: { data: LogKey }) => {
          written.push({
            enrollmentId: data.enrollmentId,
            absenceDate: data.absenceDate,
          });
          return Promise.resolve({});
        }),
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

  it("sanoq BITTA so'rovda, birinchi qoldirishdan boshlab olinadi", async () => {
    const { service, streakService } = makeService(on, []);
    await service.runForCompany(companyId);
    expect(streakService.computeStreaks).toHaveBeenCalledTimes(1);
    expect(streakService.computeStreaks).toHaveBeenCalledWith({
      companyId,
      threshold: 1,
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
    expect(notify.nudgeStudent).not.toHaveBeenCalled();
  });

  it('birinchi qoldirishda 1-bosqich (nudge) yuboriladi, ogohlantirish emas', async () => {
    const { service, notify, prisma } = makeService(on, [streak(10001, 1)]);
    const r = await service.runForCompany(companyId);
    expect(r.warned).toBe(1);
    // The message names the lesson this row counted, so the row's own
    // absence date must reach it — the run date is a different day.
    expect(notify.nudgeStudent).toHaveBeenCalledWith(
      expect.objectContaining({ streak: 1 }),
      new Date('2026-09-18T00:00:00.000Z'),
    );
    expect(notify.warnStudent).not.toHaveBeenCalled();
    expect(prisma.absenceWarningLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ enrollmentId: 'e-10001', streak: 1 }),
    });
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

  describe('remindForCompany (evening run)', () => {
    it('sends stages 1 and 2 and pauses nobody', async () => {
      const { service, statusService, notify } = makeService(on, [
        streak(10001, 3),
        streak(10002, 2),
        streak(10003, 1),
      ]);
      const sent = await service.remindForCompany(companyId);

      expect(sent).toBe(2);
      expect(notify.warnStudent).toHaveBeenCalledWith(
        expect.objectContaining({ enrollmentId: 'e-10002', streak: 2 }),
        1,
      );
      expect(notify.nudgeStudent).toHaveBeenCalledWith(
        expect.objectContaining({ enrollmentId: 'e-10003', streak: 1 }),
        new Date('2026-09-18T00:00:00.000Z'),
      );
      expect(statusService.pauseForAbsence).not.toHaveBeenCalled();
      expect(notify.announcePause).not.toHaveBeenCalled();
    });

    it('leaves the daily cap and its CEO alert to the morning run', async () => {
      const many = Array.from({ length: 11 }, (_, i) => streak(10001 + i, 3));
      const { service, notify } = makeService({ ...on, dailyCap: 10 }, many);
      await service.remindForCompany(companyId);
      expect(notify.alertCeos).not.toHaveBeenCalled();
    });

    it('does not touch the database when the feature is off', async () => {
      const { service, streakService } = makeService(
        { ...on, enabled: false },
        [streak(10001, 1)],
      );
      expect(await service.remindForCompany(companyId)).toBe(0);
      expect(streakService.computeStreaks).not.toHaveBeenCalled();
    });

    it('an absence messaged in the evening is not messaged again next morning', async () => {
      const { service, notify } = makeService(on, [
        streak(10001, 1),
        streak(10002, 2),
      ]);
      await service.remindForCompany(companyId);
      await service.runForCompany(companyId);

      expect(notify.nudgeStudent).toHaveBeenCalledTimes(1);
      expect(notify.warnStudent).toHaveBeenCalledTimes(1);
    });
  });
});
