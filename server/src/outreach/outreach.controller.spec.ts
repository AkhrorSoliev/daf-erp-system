import { Test, TestingModule } from '@nestjs/testing';
import { OutreachController } from './outreach.controller';
import { OutreachService } from './outreach.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('OutreachController', () => {
  let controller: OutreachController;

  const mockService = {
    getStats: jest.fn().mockResolvedValue({}),
    getTodayAbsentees: jest.fn().mockResolvedValue({}),
    getRemovalQueue: jest.fn().mockResolvedValue({}),
    getAutoPaused: jest.fn().mockResolvedValue({}),
    getActivePromises: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutreachController],
      providers: [{ provide: OutreachService, useValue: mockService }],
    }).compile();

    controller = module.get(OutreachController);
  });

  const handlers = [
    'getStats',
    'getTodayAbsentees',
    'getRemovalQueue',
    'getAutoPaused',
    'getActivePromises',
  ] as const;

  describe('route access', () => {
    it.each(handlers)('%s is gated by the outreach capability', (name) => {
      expect(routeAccess(OutreachController, name)).toEqual({
        kind: 'can',
        keys: ['outreach.view'],
      });
    });

    it.each(handlers)(
      '%s admits the three admin roles by default, not the Teacher or the Cashier',
      (name) => {
        expect(defaultRolesOf(OutreachController, name)).toEqual([
          'Administrator',
          'Branch Director',
          'CEO',
        ]);
      },
    );
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
