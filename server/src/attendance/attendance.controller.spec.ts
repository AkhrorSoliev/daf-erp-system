import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AttendanceController } from './attendance.controller';
import { RolesGuard } from '../common/guards/roles.guard';
import { ROLES_KEY } from '../common/decorators';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';

jest.mock('../common/auth/group-branch-scope', () => ({
  assertCallerMayTouchGroup: jest.fn().mockResolvedValue(undefined),
}));

describe("AttendanceController — «Dars bo'ldimi?» routes", () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const context = (handler: unknown, roles: string[]) =>
    ({
      getHandler: () => handler,
      getClass: () => AttendanceController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as any;

  it.each(['saveLate', 'notHeld'] as const)(
    '%s is limited to CEO, Branch Director, Administrator',
    (name) => {
      expect(
        reflector.get<string[]>(
          ROLES_KEY,
          AttendanceController.prototype[name],
        ),
      ).toEqual(['CEO', 'Branch Director', 'Administrator']);
    },
  );

  it.each(['CEO', 'Branch Director', 'Administrator'])(
    'lets %s answer',
    (role) => {
      expect(
        guard.canActivate(
          context(AttendanceController.prototype.saveLate, [role]),
        ),
      ).toBe(true);
    },
  );

  it.each(['Teacher', 'Cashier'])('stops %s', (role) => {
    expect(() =>
      guard.canActivate(
        context(AttendanceController.prototype.notHeld, [role]),
      ),
    ).toThrow(ForbiddenException);
  });
});

describe('AttendanceController — the answers reach the services only past the branch check', () => {
  const prisma = {} as any;
  const attendanceService = {
    saveLate: jest.fn().mockResolvedValue({ saved: true }),
    getByDate: jest.fn().mockResolvedValue({ activeStudents: [] }),
  };
  const unmarkedLessons = {
    answerNotHeld: jest.fn().mockResolvedValue({ id: 'c1' }),
  };
  const controller = new AttendanceController(
    attendanceService as any,
    {} as any,
    prisma,
    unmarkedLessons as any,
  );
  const guardCheck = assertCallerMayTouchGroup as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    guardCheck.mockResolvedValue(undefined);
  });

  it("«Bo'ldi» checks the group's branch for that day, then saves", async () => {
    const dto = { entries: [] } as any;
    await controller.saveLate('g1', '2026-09-28', dto, 5, ['Administrator'], 1);

    expect(guardCheck).toHaveBeenCalledWith(
      prisma,
      5,
      ['Administrator'],
      'g1',
      expect.any(String),
      { lessonDate: new Date('2026-09-28T00:00:00.000Z') },
    );
    expect(attendanceService.saveLate).toHaveBeenCalledWith(
      'g1',
      '2026-09-28',
      dto,
      5,
      ['Administrator'],
      1,
    );
  });

  it("«Bo'ldi» saves nothing for a group outside the caller's branch", async () => {
    guardCheck.mockRejectedValue(new ForbiddenException('boshqa filial'));

    await expect(
      controller.saveLate(
        'g1',
        '2026-09-28',
        {} as any,
        5,
        ['Administrator'],
        1,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(attendanceService.saveLate).not.toHaveBeenCalled();
  });

  it("«Bo'lmadi» checks the group's branch, then answers", async () => {
    const dto = { action: 'CANCEL', reason: 'Ustoz kasal' } as any;
    await controller.notHeld('g1', '2026-09-28', dto, 5, ['CEO'], 1);

    expect(guardCheck).toHaveBeenCalledTimes(1);
    expect(unmarkedLessons.answerNotHeld).toHaveBeenCalledWith({
      groupId: 'g1',
      date: '2026-09-28',
      dto,
      userId: 5,
      roles: ['CEO'],
      companyId: 1,
    });
  });

  it("«Bo'lmadi» answers nothing for a group outside the caller's branch", async () => {
    guardCheck.mockRejectedValue(new ForbiddenException('boshqa filial'));

    await expect(
      controller.notHeld('g1', '2026-09-28', {} as any, 5, ['CEO'], 1),
    ).rejects.toThrow(ForbiddenException);
    expect(unmarkedLessons.answerNotHeld).not.toHaveBeenCalled();
  });

  it.each([
    ['1', ['Administrator'], true],
    ['1', ['Teacher', 'Administrator'], true],
    ['1', ['Teacher'], false],
    [undefined, ['Administrator'], false],
    ['0', ['Administrator'], false],
  ] as const)(
    'GET ?late=%s for %j asks for the late roster: %s',
    async (late, roles, expected) => {
      await controller.getByDate(
        'g1',
        '2026-09-28',
        5,
        [...roles],
        1,
        late as string | undefined,
      );

      expect(attendanceService.getByDate).toHaveBeenCalledWith(
        'g1',
        '2026-09-28',
        1,
        [...roles],
        expected,
      );
    },
  );
});
