import { ForbiddenException } from '@nestjs/common';
import { ReportsMarketingController } from './reports-marketing.controller';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';

describe('ReportsMarketingController', () => {
  const service = { getMarketing: jest.fn().mockResolvedValue({}) };
  const prisma = { user: { findFirst: jest.fn() } };
  const controller = new ReportsMarketingController(
    service as never,
    prisma as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('is gated by the finance report capability — a money report', () => {
    expect(routeAccess(ReportsMarketingController, 'getMarketing')).toEqual({
      kind: 'can',
      keys: ['reports.finance'],
    });
  });

  it('admits the CEO and the Branch Director by default, nobody else', () => {
    expect(defaultRolesOf(ReportsMarketingController, 'getMarketing')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

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
