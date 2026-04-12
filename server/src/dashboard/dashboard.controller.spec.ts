import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ROLES_KEY } from '../common/decorators';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockService }],
    }).compile();

    controller = module.get(DashboardController);
    reflector = new Reflector();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTodaySchedule()', () => {
    it('should NOT have @Roles metadata (open to all authenticated users)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getTodaySchedule);
      expect(roles).toBeUndefined();
    });

    it('should delegate to service with correct params', async () => {
      await controller.getTodaySchedule({ branchId: 1, date: '2026-04-13' });

      expect(mockService.getTodaySchedule).toHaveBeenCalledWith(1, '2026-04-13');
    });

    it('should delegate to service without date when not provided', async () => {
      await controller.getTodaySchedule({ branchId: 2 });

      expect(mockService.getTodaySchedule).toHaveBeenCalledWith(2, undefined);
    });
  });
});
