import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OutreachController } from './outreach.controller';
import { OutreachService } from './outreach.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('OutreachController — role guards', () => {
  let controller: OutreachController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    getStats: jest.fn().mockResolvedValue({}),
    getTodayAbsentees: jest.fn().mockResolvedValue({}),
    getRemovalQueue: jest.fn().mockResolvedValue({}),
    getActivePromises: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutreachController],
      providers: [{ provide: OutreachService, useValue: mockService }],
    }).compile();

    controller = module.get(OutreachController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => OutreachController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('class-level @Roles metadata', () => {
    it('should restrict to CEO, Branch Director, Administrator', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, OutreachController);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });
  });

  const handlers: Array<{
    name: string;
    handler: (...args: unknown[]) => unknown;
  }> = [
    { name: 'getStats', handler: () => null },
    { name: 'getTodayAbsentees', handler: () => null },
    { name: 'getRemovalQueue', handler: () => null },
    { name: 'getActivePromises', handler: () => null },
  ];

  handlers.forEach(({ name }) => {
    describe(`${name}() guard`, () => {
      const h = () => null;
      it('allows CEO', () => {
        expect(guard.canActivate(mockExecutionContext(h, ['CEO']))).toBe(true);
      });
      it('allows Branch Director', () => {
        expect(
          guard.canActivate(mockExecutionContext(h, ['Branch Director'])),
        ).toBe(true);
      });
      it('allows Administrator', () => {
        expect(
          guard.canActivate(mockExecutionContext(h, ['Administrator'])),
        ).toBe(true);
      });
      it('denies Teacher', () => {
        expect(() =>
          guard.canActivate(mockExecutionContext(h, ['Teacher'])),
        ).toThrow(ForbiddenException);
      });
      it('denies Cashier', () => {
        expect(() =>
          guard.canActivate(mockExecutionContext(h, ['Cashier'])),
        ).toThrow(ForbiddenException);
      });
    });
  });

  // Sanity check that the controller actually delegates to the service —
  // catches accidental param-decorator typos.
  describe('handler wiring', () => {
    it('getTodayAbsentees delegates to service with user context and no date', async () => {
      await controller.getTodayAbsentees({}, 10001, 1, ['CEO'], null);
      expect(mockService.getTodayAbsentees).toHaveBeenCalledWith({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
        date: undefined,
      });
    });

    it('getTodayAbsentees forwards the date query param', async () => {
      await controller.getTodayAbsentees(
        { date: '2026-06-01' },
        10001,
        1,
        ['CEO'],
        null,
      );
      expect(mockService.getTodayAbsentees).toHaveBeenCalledWith({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
        date: '2026-06-01',
      });
    });

    it('getRemovalQueue delegates to service with user context', async () => {
      await controller.getRemovalQueue(10001, 1, ['Branch Director'], [2]);
      expect(mockService.getRemovalQueue).toHaveBeenCalledWith({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
        branchScope: [2],
      });
    });

    it('getStats delegates to service with user context', async () => {
      await controller.getStats(10001, 1, ['Administrator'], [2]);
      expect(mockService.getStats).toHaveBeenCalledWith({
        userId: 10001,
        companyId: 1,
        roles: ['Administrator'],
        branchScope: [2],
      });
    });

    it('getActivePromises delegates to service with user context', async () => {
      await controller.getActivePromises(10001, 1, ['Branch Director'], [2]);
      expect(mockService.getActivePromises).toHaveBeenCalledWith({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
        branchScope: [2],
      });
    });
  });
});
