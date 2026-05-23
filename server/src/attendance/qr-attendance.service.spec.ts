import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QrAttendanceService } from './qr-attendance.service';
import { QrAttendanceSessionService } from './qr-attendance-session.service';
import { QrAttendanceScanService } from './qr-attendance-scan.service';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { EntityHistoryService } from '../common/entity-history';
import { LessonBillingService } from '../billing/lesson-billing.service';

const validatedGroup = {
  id: 'group-1',
  companyId: 1,
  exactDays: ['monday', 'wednesday', 'friday'],
  startDate: new Date('2026-03-01'),
  endDate: new Date('2026-06-30'),
  statusEnum: 'ACTIVE',
};

describe('QrAttendanceService', () => {
  let service: QrAttendanceService;
  let prisma: any;
  let redis: any;
  let gateway: any;
  let entityHistory: any;
  let attendanceService: any;

  beforeEach(async () => {
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'group-1',
          name: 'A1-1',
          exactDays: ['monday', 'wednesday', 'friday'],
          startDate: new Date('2026-03-01'),
        }),
        findUnique: jest.fn().mockResolvedValue({
          name: 'A1-1',
          branchId: 1,
          course: { price: 400000, lessonPaymentCount: 12 },
        }),
      },
      enrollment: {
        count: jest.fn().mockResolvedValue(10),
        findFirst: jest.fn().mockResolvedValue({
          id: 'enroll-1',
          studentId: 10001,
          groupId: 'group-1',
          startDate: null,
        }),
      },
      attendance: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'att-1',
          groupId: 'group-1',
          studentId: 10001,
          date: new Date('2026-04-03'),
          status: 'PRESENT',
          markedById: 20001,
          companyId: 1,
        }),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue({
          firstName: 'Ahmad',
          lastName: 'Karimov',
          photo: null,
          balance: 500000,
        }),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      lessonCancellation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // Interactive transaction: callback gets prisma itself as tx so all
      // model mocks are reachable inside the $transaction block.
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(3600), // 1 soat qolgan
    };

    gateway = {
      sendToUser: jest.fn(),
    };

    entityHistory = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    attendanceService = {
      validateLessonDate: jest.fn().mockResolvedValue({
        group: validatedGroup,
        parsedDate: new Date('2026-04-03T00:00:00.000Z'),
      }),
    };

    const holidaysService = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
      buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
      getActiveHolidaysInRange: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrAttendanceService,
        QrAttendanceSessionService,
        QrAttendanceScanService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: EntityHistoryService, useValue: entityHistory },
        { provide: AttendanceService, useValue: attendanceService },
        {
          provide: LessonBillingService,
          useValue: { processAttendanceBilling: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: require('../holidays/holidays.service').HolidaysService,
          useValue: holidaysService,
        },
      ],
    }).compile();

    service = module.get<QrAttendanceService>(QrAttendanceService);
  });

  describe('startSession', () => {
    it('should call validateLessonDate before creating session', async () => {
      await service.startSession('group-1', '2026-04-03', 1, 1, ['Teacher']);

      expect(attendanceService.validateLessonDate).toHaveBeenCalledWith(
        'group-1',
        '2026-04-03',
        1,
        ['Teacher'],
      );
    });

    it('should throw when validateLessonDate rejects (holiday/non-lesson/inactive)', async () => {
      attendanceService.validateLessonDate.mockRejectedValue(
        new BadRequestException("Bu sana bayram kuni: Navro'z"),
      );

      await expect(
        service.startSession('group-1', '2026-04-03', 1, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a new QR session and return token', async () => {
      const result = await service.startSession('group-1', '2026-04-03', 1, 1);

      expect(result.sessionId).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBe(45);
      expect(result.totalStudents).toBe(10);
      expect(redis.set).toHaveBeenCalledTimes(2); // session + token
    });

    it('should store lessonNumber in Redis session data', async () => {
      await service.startSession('group-1', '2026-04-03', 1, 1);

      // Find the session set call (first redis.set call is session)
      const sessionSetCall = redis.set.mock.calls.find((call: any[]) =>
        call[0].startsWith('qr-session:'),
      );
      expect(sessionSetCall).toBeDefined();
      const sessionData = JSON.parse(sessionSetCall[1]);
      expect(sessionData).toHaveProperty('lessonNumber');
      expect(
        typeof sessionData.lessonNumber === 'number' ||
          sessionData.lessonNumber === null,
      ).toBe(true);
    });

    it('should reject if another teacher already has an active session', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'old-session',
          teacherId: 999,
          companyId: 1,
          currentToken: 'old-token',
          createdAt: new Date().toISOString(),
          lessonNumber: null,
        }),
      );

      await expect(
        service.startSession('group-1', '2026-04-03', 1, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should replace session if same teacher restarts', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'old-session',
          teacherId: 1,
          companyId: 1,
          currentToken: 'old-token',
          createdAt: new Date().toISOString(),
          lessonNumber: null,
        }),
      );

      const result = await service.startSession('group-1', '2026-04-03', 1, 1);

      expect(redis.del).toHaveBeenCalledWith('qr-token:old-token');
      expect(result.sessionId).toBeDefined();
      expect(result.token).toBeDefined();
    });
  });

  describe('rotateToken', () => {
    it('should generate a new token and delete the old one', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'session-1',
          teacherId: 1,
          companyId: 1,
          currentToken: 'old-token',
          createdAt: new Date().toISOString(),
          lessonNumber: 5,
        }),
      );

      const result = await service.rotateToken(
        'group-1',
        '2026-04-03',
        'session-1',
        1,
      );

      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBe(45);
      expect(redis.del).toHaveBeenCalledWith('qr-token:old-token');
    });

    it('should preserve remaining TTL instead of resetting to SESSION_TTL', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'session-1',
          teacherId: 1,
          companyId: 1,
          currentToken: 'old-token',
          createdAt: new Date().toISOString(),
          lessonNumber: 5,
        }),
      );
      redis.ttl.mockResolvedValue(1200); // 20 daqiqa qolgan

      await service.rotateToken('group-1', '2026-04-03', 'session-1', 1);

      // Session set should use remaining TTL (1200), not SESSION_TTL (7200)
      const sessionSetCall = redis.set.mock.calls.find((call: any[]) =>
        call[0].startsWith('qr-session:'),
      );
      expect(sessionSetCall).toBeDefined();
      expect(sessionSetCall[3]).toBe(1200); // 'EX' value = remaining TTL
    });

    it('should throw BadRequestException when session TTL has expired', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'session-1',
          teacherId: 1,
          companyId: 1,
          currentToken: 'old-token',
          createdAt: new Date().toISOString(),
          lessonNumber: 5,
        }),
      );
      redis.ttl.mockResolvedValue(0); // TTL tugagan

      await expect(
        service.rotateToken('group-1', '2026-04-03', 'session-1', 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if session not found', async () => {
      await expect(
        service.rotateToken('group-1', '2026-04-03', 'no-session', 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if sessionId does not match', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'session-1',
          teacherId: 1,
          companyId: 1,
          currentToken: 'old-token',
          createdAt: new Date().toISOString(),
          lessonNumber: 5,
        }),
      );

      await expect(
        service.rotateToken('group-1', '2026-04-03', 'wrong-session', 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if different teacher tries to rotate', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'session-1',
          teacherId: 1,
          companyId: 1,
          currentToken: 'old-token',
          createdAt: new Date().toISOString(),
          lessonNumber: 5,
        }),
      );

      await expect(
        service.rotateToken('group-1', '2026-04-03', 'session-1', 999),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('stopSession', () => {
    it('should delete session and token from Redis', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'session-1',
          teacherId: 1,
          companyId: 1,
          currentToken: 'active-token',
          createdAt: new Date().toISOString(),
          lessonNumber: 5,
        }),
      );

      const result = await service.stopSession(
        'group-1',
        '2026-04-03',
        'session-1',
        1,
      );

      expect(result.message).toBe('QR sessiya tugatildi');
      expect(redis.del).toHaveBeenCalledWith('qr-token:active-token');
      expect(redis.del).toHaveBeenCalledWith('qr-session:group-1:2026-04-03');
    });

    it('should return message if session already stopped', async () => {
      const result = await service.stopSession(
        'group-1',
        '2026-04-03',
        'session-1',
        1,
      );
      expect(result.message).toBe('Sessiya allaqachon tugatilgan');
    });

    it('should throw ForbiddenException if different teacher tries to stop', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'session-1',
          teacherId: 1,
          companyId: 1,
          currentToken: 'active-token',
          createdAt: new Date().toISOString(),
          lessonNumber: 5,
        }),
      );

      await expect(
        service.stopSession('group-1', '2026-04-03', 'session-1', 999),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('scanQr', () => {
    const tokenData = JSON.stringify({
      groupId: 'group-1',
      date: '2026-04-03',
      sessionId: 'session-1',
      teacherId: 1,
      companyId: 1,
    });

    const sessionData = JSON.stringify({
      sessionId: 'session-1',
      teacherId: 1,
      companyId: 1,
      currentToken: 'valid-token',
      createdAt: new Date().toISOString(),
      lessonNumber: 15,
    });

    it('should mark attendance as PRESENT and notify teacher', async () => {
      redis.get
        .mockResolvedValueOnce(tokenData) // token lookup
        .mockResolvedValueOnce(sessionData); // session lookup for lessonNumber

      const result = await service.scanQr('valid-token', 10001, 20001, 1);

      expect(result.status).toBe('PRESENT');
      expect(result.alreadyMarked).toBe(false);
      expect(result.groupName).toBe('A1-1');
      // Verify markedMethod is QR for QR attendance
      expect(prisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ markedMethod: 'QR' }),
          update: expect.objectContaining({ markedMethod: 'QR' }),
        }),
      );
      expect(gateway.sendToUser).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'qr-attendance',
          studentId: 10001,
          status: 'PRESENT',
        }),
      );
      expect(entityHistory.recordCreate).toHaveBeenCalled();
    });

    it('should read lessonNumber from Redis session instead of computing', async () => {
      redis.get
        .mockResolvedValueOnce(tokenData) // token lookup
        .mockResolvedValueOnce(sessionData); // session lookup

      const result = await service.scanQr('valid-token', 10001, 20001, 1);

      expect(result.lessonNumber).toBe(15);
      // Verify session was read
      expect(redis.get).toHaveBeenCalledWith('qr-session:group-1:2026-04-03');
    });

    it('should return null lessonNumber when session not found in Redis', async () => {
      redis.get
        .mockResolvedValueOnce(tokenData) // token lookup
        .mockResolvedValueOnce(null); // session not found

      const result = await service.scanQr('valid-token', 10001, 20001, 1);

      expect(result.lessonNumber).toBeNull();
    });

    it('should throw BadRequestException for expired/invalid token', async () => {
      redis.get.mockResolvedValue(null);

      await expect(
        service.scanQr('expired-token', 10001, 20001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if student not enrolled', async () => {
      redis.get
        .mockResolvedValueOnce(tokenData)
        .mockResolvedValueOnce(sessionData);
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(
        service.scanQr('valid-token', 10001, 20001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return alreadyMarked if already present', async () => {
      redis.get
        .mockResolvedValueOnce(tokenData)
        .mockResolvedValueOnce(sessionData);
      prisma.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        status: 'PRESENT',
      });

      const result = await service.scanQr('valid-token', 10001, 20001, 1);

      expect(result.alreadyMarked).toBe(true);
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('should record update history when overwriting existing attendance', async () => {
      redis.get
        .mockResolvedValueOnce(tokenData)
        .mockResolvedValueOnce(sessionData);
      prisma.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        status: 'ABSENT',
        groupId: 'group-1',
        studentId: 10001,
      });

      await service.scanQr('valid-token', 10001, 20001, 1);

      expect(entityHistory.recordUpdate).toHaveBeenCalled();
    });
  });
});
