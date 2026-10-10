import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StudentPortalController } from './student-portal.controller';
import { StudentPortalService } from './student-portal.service';
import { RedisService } from '../redis/redis.service';
import { QrAttendanceService } from '../attendance/qr-attendance.service';
import { GatewayConfigService } from '../payment-gateways/gateway-config.service';
import { AuthService } from '../auth/auth.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('StudentPortalController — route access', () => {
  let controller: StudentPortalController;

  const mockService = {
    getProfile: jest.fn().mockResolvedValue({}),
    getSchedule: jest.fn().mockResolvedValue([]),
    getAttendanceStats: jest.fn().mockResolvedValue({}),
    getAttendanceHistory: jest.fn().mockResolvedValue([]),
    updateName: jest.fn().mockResolvedValue({}),
    changePassword: jest.fn().mockResolvedValue({}),
    updatePhoto: jest.fn().mockResolvedValue({}),
    removePhoto: jest.fn().mockResolvedValue({}),
  };

  const mockQrService = {
    scanQr: jest.fn().mockResolvedValue({}),
  };

  const mockAuth = {
    issueSession: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 99001 },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentPortalController],
      providers: [
        { provide: StudentPortalService, useValue: mockService },
        // OwnPasswordAttemptGuard (ADR-0031) is built with the controller.
        { provide: RedisService, useValue: {} },
        { provide: QrAttendanceService, useValue: mockQrService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: GatewayConfigService,
          useValue: { getConfig: jest.fn().mockResolvedValue(null) },
        },
        { provide: AuthService, useValue: mockAuth },
      ],
    }).compile();

    controller = module.get(StudentPortalController);
  });

  // Every route of the student portal: the student's own data, and no staff
  // role by default (a staff token gets 403 before any handler runs).
  describe.each([
    'getProfile',
    'getSchedule',
    'getAttendanceStats',
    'getAttendanceHistory',
    'updateName',
    'changePassword',
    'updatePhoto',
    'removePhoto',
    'getPayments',
    'initPayment',
    'scanQr',
  ])('%s()', (method) => {
    it('is marked student-only', () => {
      expect(routeAccess(StudentPortalController, method)).toEqual({
        kind: 'student',
      });
    });

    it('admits the Student role and no staff role', () => {
      expect(defaultRolesOf(StudentPortalController, method)).toEqual([
        'Student',
      ]);
    });
  });

  describe('changePassword()', () => {
    it('hands the student a fresh session AFTER the change', async () => {
      mockService.changePassword.mockResolvedValue({
        message: "Parol muvaffaqiyatli o'zgartirildi",
        sessionVersion: 4,
      });

      const res = await controller.changePassword(99001, 10001, {
        oldPassword: 'eskiParol1',
        newPassword: 'yangiParol1',
      });

      expect(mockAuth.issueSession).toHaveBeenCalledWith(99001, 4);
      expect(res).not.toHaveProperty('sessionVersion');
      const last = (fn: jest.Mock) =>
        fn.mock.invocationCallOrder[fn.mock.invocationCallOrder.length - 1];
      expect(last(mockService.changePassword)).toBeLessThan(
        last(mockAuth.issueSession),
      );
      expect(res).toMatchObject({ accessToken: 'a', refreshToken: 'r' });
    });
  });

  // Havola ochiq (brauzer tarixi, referer). CLICK_SERVICE_ID yo'q bo'lsa
  // uning o'rniga webhook imzosining MAXFIY kaliti qo'yilardi.
  describe('initPayment() — Click', () => {
    it("CLICK_SERVICE_ID yo'q bo'lsa maxfiy kalitni havolaga qo'ymaydi", async () => {
      const gatewayConfig = {
        getConfig: jest
          .fn()
          .mockResolvedValue({ merchantId: 'm-1', secretKey: 'click-secret' }),
      };
      const mod = await Test.createTestingModule({
        controllers: [StudentPortalController],
        providers: [
          {
            provide: StudentPortalService,
            useValue: { createPaymentIntent: jest.fn() },
          },
          { provide: QrAttendanceService, useValue: mockQrService },
          { provide: ConfigService, useValue: { get: jest.fn() } },
          { provide: GatewayConfigService, useValue: gatewayConfig },
          // Built with the controller for the password routes; unused here.
          { provide: RedisService, useValue: {} },
          { provide: AuthService, useValue: {} },
        ],
      }).compile();
      const ctrl = mod.get(StudentPortalController);

      await expect(
        ctrl.initPayment(10050, 1001, {
          method: 'CLICK',
          amount: 50000,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
