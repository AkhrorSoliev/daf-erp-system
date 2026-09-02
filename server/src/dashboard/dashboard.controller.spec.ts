import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { ROLES_KEY, STAFF_ROLES } from '../common/decorators';

describe('DashboardController', () => {
  let controller: DashboardController;
  let reflector: Reflector;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockService },
        { provide: DashboardSummaryService, useValue: mockSummaryService },
      ],
    }).compile();

    controller = module.get(DashboardController);
    reflector = new Reflector();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTodaySchedule()', () => {
    it('is staff-only — a student-portal token must not read it', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getTodaySchedule,
      );
      expect(roles).toEqual(expect.arrayContaining([...STAFF_ROLES]));
      expect(roles).not.toContain('Student');
    });

    it('should delegate to service with correct params', async () => {
      await controller.getTodaySchedule(
        { branchId: 1, date: '2026-04-13' },
        1001,
        null,
      );

      expect(mockService.getTodaySchedule).toHaveBeenCalledWith(
        1,
        1001,
        '2026-04-13',
      );
    });

    it('should delegate to service without date when not provided', async () => {
      await controller.getTodaySchedule({ branchId: 2 }, 1001, null);

      expect(mockService.getTodaySchedule).toHaveBeenCalledWith(
        2,
        1001,
        undefined,
      );
    });
  });
  describe('getSummary()', () => {
    it("o'qituvchi va o'quvchiga yopiq, qolgan xodimlarga ochiq", () => {
      // O'qituvchi `/` da jadvalni ko'radi; bu endpoint esa markazning pul
      // ko'rsatkichlarini olib keladi, shuning uchun STAFF_ROLES yetarli emas.
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getSummary);
      expect(roles).toEqual([
        'CEO',
        'Branch Director',
        'Administrator',
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
});
