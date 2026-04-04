import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { QrAttendanceService } from './qr-attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { EntityHistoryService } from '../common/entity-history';

describe('QrAttendanceService', () => {
  let service: QrAttendanceService;
  let prisma: any;
  let redis: any;
  let gateway: any;
  let entityHistory: any;

  beforeEach(async () => {
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue({ id: 'group-1', name: 'A1-1' }),
        findUnique: jest.fn().mockResolvedValue({ name: 'A1-1' }),
      },
      enrollment: {
        count: jest.fn().mockResolvedValue(10),
        findFirst: jest.fn().mockResolvedValue({ id: 'enroll-1', studentId: 10001, groupId: 'group-1' }),
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
        }),
      },
    };

    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrAttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: EntityHistoryService, useValue: entityHistory },
      ],
    }).compile();

    service = module.get<QrAttendanceService>(QrAttendanceService);
  });

  describe('startSession', () => {
    it('should create a new QR session and return token', async () => {
      const result = await service.startSession('group-1', '2026-04-03', 1, 1);

      expect(result.sessionId).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBe(45);
      expect(result.totalStudents).toBe(10);
      expect(redis.set).toHaveBeenCalledTimes(2); // session + token
    });

    it('should throw BadRequestException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.startSession('non-existent', '2026-04-03', 1, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if another teacher already has an active session', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          sessionId: 'old-session',
          teacherId: 999,
          companyId: 1,
          currentToken: 'old-token',
          createdAt: new Date().toISOString(),
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
        }),
      );

      const result = await service.rotateToken('group-1', '2026-04-03', 'session-1', 1);

      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBe(45);
      expect(redis.del).toHaveBeenCalledWith('qr-token:old-token');
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
        }),
      );

      const result = await service.stopSession('group-1', '2026-04-03', 'session-1', 1);

      expect(result.message).toBe('QR sessiya tugatildi');
      expect(redis.del).toHaveBeenCalledWith('qr-token:active-token');
      expect(redis.del).toHaveBeenCalledWith('qr-session:group-1:2026-04-03');
    });

    it('should return message if session already stopped', async () => {
      const result = await service.stopSession('group-1', '2026-04-03', 'session-1', 1);
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

    it('should mark attendance as PRESENT and notify teacher', async () => {
      redis.get.mockResolvedValue(tokenData);

      const result = await service.scanQr('valid-token', 10001, 20001, 1);

      expect(result.status).toBe('PRESENT');
      expect(result.alreadyMarked).toBe(false);
      expect(result.groupName).toBe('A1-1');
      expect(prisma.attendance.upsert).toHaveBeenCalled();
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

    it('should throw BadRequestException for expired/invalid token', async () => {
      redis.get.mockResolvedValue(null);

      await expect(
        service.scanQr('expired-token', 10001, 20001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if student not enrolled', async () => {
      redis.get.mockResolvedValue(tokenData);
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(
        service.scanQr('valid-token', 10001, 20001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return alreadyMarked if already present', async () => {
      redis.get.mockResolvedValue(tokenData);
      prisma.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        status: 'PRESENT',
      });

      const result = await service.scanQr('valid-token', 10001, 20001, 1);

      expect(result.alreadyMarked).toBe(true);
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('should record update history when overwriting existing attendance', async () => {
      redis.get.mockResolvedValue(tokenData);
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
