import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { StudentPortalController } from './student-portal.controller';
import { StudentPortalService } from './student-portal.service';
import { QrAttendanceService } from '../attendance/qr-attendance.service';
import { GatewayConfigService } from '../payment-gateways/gateway-config.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('StudentPortalController — role guards', () => {
  let controller: StudentPortalController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    getProfile: jest.fn().mockResolvedValue({}),
    getSchedule: jest.fn().mockResolvedValue([]),
    getAttendanceStats: jest.fn().mockResolvedValue({}),
    getAttendanceHistory: jest.fn().mockResolvedValue([]),
    updateName: jest.fn().mockResolvedValue({}),
    changePassword: jest.fn().mockResolvedValue({}),
    updatePhoto: jest.fn().mockResolvedValue({}),
  };

  const mockQrService = {
    scanQr: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentPortalController],
      providers: [
        { provide: StudentPortalService, useValue: mockService },
        { provide: QrAttendanceService, useValue: mockQrService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: GatewayConfigService,
          useValue: { getConfig: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    controller = module.get(StudentPortalController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(handler: Function, roles: string[]) {
    return {
      getHandler: () => handler,
      getClass: () => StudentPortalController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('getProfile()', () => {
    it('should have @Roles(Student) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getProfile);
      expect(roles).toEqual(['Student']);
    });

    it('should allow Student to access', () => {
      const ctx = mockExecutionContext(controller.getProfile, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny CEO from accessing', () => {
      const ctx = mockExecutionContext(controller.getProfile, ['CEO']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Administrator from accessing', () => {
      const ctx = mockExecutionContext(controller.getProfile, [
        'Administrator',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from accessing', () => {
      const ctx = mockExecutionContext(controller.getProfile, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from accessing', () => {
      const ctx = mockExecutionContext(controller.getProfile, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('getSchedule()', () => {
    it('should have @Roles(Student) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getSchedule);
      expect(roles).toEqual(['Student']);
    });

    it('should allow Student to access', () => {
      const ctx = mockExecutionContext(controller.getSchedule, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny CEO from accessing', () => {
      const ctx = mockExecutionContext(controller.getSchedule, ['CEO']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Administrator from accessing', () => {
      const ctx = mockExecutionContext(controller.getSchedule, [
        'Administrator',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from accessing', () => {
      const ctx = mockExecutionContext(controller.getSchedule, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from accessing', () => {
      const ctx = mockExecutionContext(controller.getSchedule, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('getAttendanceStats()', () => {
    it('should have @Roles(Student) metadata', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getAttendanceStats,
      );
      expect(roles).toEqual(['Student']);
    });

    it('should allow Student to access', () => {
      const ctx = mockExecutionContext(controller.getAttendanceStats, [
        'Student',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny CEO from accessing', () => {
      const ctx = mockExecutionContext(controller.getAttendanceStats, ['CEO']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Administrator from accessing', () => {
      const ctx = mockExecutionContext(controller.getAttendanceStats, [
        'Administrator',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from accessing', () => {
      const ctx = mockExecutionContext(controller.getAttendanceStats, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from accessing', () => {
      const ctx = mockExecutionContext(controller.getAttendanceStats, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('getAttendanceHistory()', () => {
    it('should have @Roles(Student) metadata', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getAttendanceHistory,
      );
      expect(roles).toEqual(['Student']);
    });

    it('should allow Student to access', () => {
      const ctx = mockExecutionContext(controller.getAttendanceHistory, [
        'Student',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny CEO from accessing', () => {
      const ctx = mockExecutionContext(controller.getAttendanceHistory, [
        'CEO',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from accessing', () => {
      const ctx = mockExecutionContext(controller.getAttendanceHistory, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('updateName()', () => {
    it('should have @Roles(Student) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.updateName);
      expect(roles).toEqual(['Student']);
    });

    it('should allow Student to access', () => {
      const ctx = mockExecutionContext(controller.updateName, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny CEO from accessing', () => {
      const ctx = mockExecutionContext(controller.updateName, ['CEO']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('changePassword()', () => {
    it('should have @Roles(Student) metadata', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.changePassword,
      );
      expect(roles).toEqual(['Student']);
    });

    it('should allow Student to access', () => {
      const ctx = mockExecutionContext(controller.changePassword, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny CEO from accessing', () => {
      const ctx = mockExecutionContext(controller.changePassword, ['CEO']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from accessing', () => {
      const ctx = mockExecutionContext(controller.changePassword, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('updatePhoto()', () => {
    it('should have @Roles(Student) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.updatePhoto);
      expect(roles).toEqual(['Student']);
    });

    it('should allow Student to access', () => {
      const ctx = mockExecutionContext(controller.updatePhoto, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny CEO from accessing', () => {
      const ctx = mockExecutionContext(controller.updatePhoto, ['CEO']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from accessing', () => {
      const ctx = mockExecutionContext(controller.updatePhoto, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('scanQr()', () => {
    it('should have @Roles(Student) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.scanQr);
      expect(roles).toEqual(['Student']);
    });

    it('should allow Student to access', () => {
      const ctx = mockExecutionContext(controller.scanQr, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny CEO from accessing', () => {
      const ctx = mockExecutionContext(controller.scanQr, ['CEO']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from accessing', () => {
      const ctx = mockExecutionContext(controller.scanQr, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
