import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReportsMarketingController } from './reports-marketing.controller';
import { RolesGuard } from '../../common/guards';
import { ROLES_KEY } from '../../common/decorators';

describe('ReportsMarketingController', () => {
  const service = { getMarketing: jest.fn().mockResolvedValue({}) };
  const prisma = { user: { findFirst: jest.fn() } };
  const controller = new ReportsMarketingController(
    service as never,
    prisma as never,
  );
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const ctx = (roles: string[]) =>
    ({
      getHandler: () => controller.getMarketing,
      getClass: () => ReportsMarketingController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as never;

  beforeEach(() => jest.clearAllMocks());

  it('is CEO and Branch Director only — a money report', () => {
    expect(
      reflector.get<string[]>(ROLES_KEY, ReportsMarketingController),
    ).toEqual(['CEO', 'Branch Director']);
  });

  it.each(['CEO', 'Branch Director'])('lets %s in', (role) => {
    expect(guard.canActivate(ctx([role]))).toBe(true);
  });

  it.each(['Administrator', 'Cashier', 'Teacher', 'Student'])(
    'refuses %s',
    (role) => {
      expect(() => guard.canActivate(ctx([role]))).toThrow(ForbiddenException);
    },
  );

  it('hands the service the resolved scope and the month', async () => {
    prisma.user.findFirst.mockResolvedValue({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    });

    await controller.getMarketing(
      { month: '2026-09', branchId: 2 },
      1001,
      10001,
    );

    expect(service.getMarketing).toHaveBeenCalledWith(1001, {
      month: '2026-09',
      branchIds: [2],
    });
  });

  it('refuses a caller whose scope resolved to no branch, before reading anything', async () => {
    prisma.user.findFirst.mockResolvedValue({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'Branch Director' } }],
    });

    await expect(controller.getMarketing({}, 1001, 10002)).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.getMarketing).not.toHaveBeenCalled();
  });
});
