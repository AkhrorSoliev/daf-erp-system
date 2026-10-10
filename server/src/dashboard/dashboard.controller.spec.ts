import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { DashboardChartsService } from './dashboard-charts.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('DashboardController', () => {
  let controller: DashboardController;

  const mockService = {
    getTodaySchedule: jest.fn().mockResolvedValue({
      lessons: [],
      rooms: [],
      workingHours: { start: '08:00', end: '20:00' },
      isHoliday: false,
      holidayName: null,
      date: '2026-04-13',
    }),
  };

  const mockSummaryService = {
    getSummary: jest.fn().mockResolvedValue({
      money: null,
      people: null,
      attention: null,
      nextLessons: null,
      failed: [],
    }),
  };

  const mockChartsService = {
    getCharts: jest.fn().mockResolvedValue({
      money: null,
      students: null,
      attendance: null,
      failed: [],
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockService },
        { provide: DashboardSummaryService, useValue: mockSummaryService },
        { provide: DashboardChartsService, useValue: mockChartsService },
      ],
    }).compile();

    controller = module.get(DashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTodaySchedule()', () => {
    it('is staff-only — a student-portal token must not read it', () => {
      expect(routeAccess(DashboardController, 'getTodaySchedule')).toEqual({
        kind: 'anyStaff',
      });
      expect(defaultRolesOf(DashboardController, 'getTodaySchedule')).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
        'Cashier',
        'Teacher',
      ]);
    });

    it('should delegate to service with correct params', async () => {
      await controller.getTodaySchedule(
        { branchId: 1, date: '2026-04-13' },
        1001,
        null,
        10406,
        ['Administrator'],
      );

      expect(mockService.getTodaySchedule).toHaveBeenCalledWith(
        1,
        1001,
        '2026-04-13',
        undefined,
      );
    });

    it('should delegate to service without date when not provided', async () => {
      await controller.getTodaySchedule({ branchId: 2 }, 1001, null, 10406, [
        'CEO',
      ]);

      expect(mockService.getTodaySchedule).toHaveBeenCalledWith(
        2,
        1001,
        undefined,
        undefined,
      );
    });

    it('narrows a pure teacher to their own lessons', async () => {
      await controller.getTodaySchedule({ branchId: 1 }, 1001, null, 10042, [
        'Teacher',
      ]);

      expect(mockService.getTodaySchedule).toHaveBeenCalledWith(
        1,
        1001,
        undefined,
        10042,
      );
    });

    it('leaves a teacher who also holds another staff role on the whole day', async () => {
      await controller.getTodaySchedule({ branchId: 1 }, 1001, null, 10042, [
        'Teacher',
        'Administrator',
      ]);

      expect(mockService.getTodaySchedule).toHaveBeenCalledWith(
        1,
        1001,
        undefined,
        undefined,
      );
    });
  });
  describe('getSummary()', () => {
    it("o'qituvchi va o'quvchiga yopiq, qolgan xodimlarga ochiq", () => {
      // O'qituvchi `/` da jadvalni ko'radi; bu endpoint esa markazning pul
      // ko'rsatkichlarini olib keladi, shuning uchun AnyStaff() yetarli emas.
      expect(routeAccess(DashboardController, 'getSummary')).toEqual({
        kind: 'can',
        keys: ['dashboard.view'],
      });
      expect(defaultRolesOf(DashboardController, 'getSummary')).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
        'Cashier',
      ]);
    });

    it('servisga chaqiruvchining konteksti bilan topshiradi', async () => {
      await controller.getSummary(
        { branchId: 1 } as any,
        { id: 10406, companyId: 1001, roles: ['CEO'] } as any,
        [1],
      );

      expect(mockSummaryService.getSummary).toHaveBeenCalledWith({
        userId: 10406,
        companyId: 1001,
        roles: ['CEO'],
        branchScope: [1],
      });
    });
  });
  describe('getCharts()', () => {
    it("o'qituvchi va o'quvchiga yopiq, qolgan xodimlarga ochiq", () => {
      expect(routeAccess(DashboardController, 'getCharts')).toEqual({
        kind: 'can',
        keys: ['dashboard.view'],
      });
      expect(defaultRolesOf(DashboardController, 'getCharts')).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
        'Cashier',
      ]);
    });

    it('servisga chaqiruvchining konteksti bilan topshiradi', async () => {
      await controller.getCharts(
        { branchId: 1 } as any,
        { id: 10406, companyId: 1001, roles: ['CEO'] } as any,
        [1],
      );

      expect(mockChartsService.getCharts).toHaveBeenCalledWith({
        userId: 10406,
        companyId: 1001,
        roles: ['CEO'],
        branchScope: [1],
      });
    });
  });
});
