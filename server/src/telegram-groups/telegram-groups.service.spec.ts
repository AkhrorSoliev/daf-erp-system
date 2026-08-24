import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TelegramGroupStatus } from '@prisma/client';
import { TelegramGroupsService } from './telegram-groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('TelegramGroupsService', () => {
  let service: TelegramGroupsService;

  const mockPrisma = {
    // Approval now requires a real branch in this company, and checks the
    // caller owns it. A CEO spans every branch.
    branch: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'CEO' } }],
      }),
    },
    telegramGroup: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const mockHistory = {
    recordCreate: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EntityHistoryService, useValue: mockHistory },
      ],
    }).compile();
    service = module.get(TelegramGroupsService);
  });

  describe('approve', () => {
    const caller = { id: 23533, companyId: 1001, roles: ['CEO'] };
    const baseGroup = {
      id: 'g1',
      chatId: BigInt(-12345),
      title: 'Test Group',
      status: TelegramGroupStatus.PENDING,
      companyId: null,
      branchId: null,
      deletedAt: null,
    };

    it('rejects callers without CEO/BD role', async () => {
      await expect(
        service.approve('g1', {
          id: 1,
          companyId: 1001,
          roles: ['Administrator'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s when group does not exist', async () => {
      mockPrisma.telegramGroup.findUnique.mockResolvedValue(null);
      await expect(service.approve('g1', caller, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to re-approve an already-approved group', async () => {
      mockPrisma.telegramGroup.findUnique.mockResolvedValue({
        ...baseGroup,
        status: TelegramGroupStatus.APPROVED,
        companyId: 999,
      });
      await expect(service.approve('g1', caller, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('binds the group to the callers company on success and writes audit', async () => {
      mockPrisma.telegramGroup.findUnique.mockResolvedValue(baseGroup);
      mockPrisma.telegramGroup.update.mockResolvedValue({
        ...baseGroup,
        status: TelegramGroupStatus.APPROVED,
        companyId: 1001,
        branchId: null,
        approvedById: 23533,
        approvedAt: new Date(),
        company: { name: 'DaF' },
        approvedBy: { firstName: 'Akhror', lastName: 'Soliev' },
      });
      await service.approve('g1', caller, 1);

      expect(mockPrisma.telegramGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: expect.objectContaining({
            status: TelegramGroupStatus.APPROVED,
            companyId: 1001,
            approvedById: 23533,
          }),
        }),
      );
      expect(mockHistory.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'TelegramGroup',
          newValues: expect.objectContaining({ action: 'APPROVED' }),
        }),
      );
    });
  });

  describe('reject', () => {
    it('forbids rejecting an already-approved group', async () => {
      mockPrisma.telegramGroup.findUnique.mockResolvedValue({
        id: 'g1',
        status: TelegramGroupStatus.APPROVED,
        deletedAt: null,
      });
      await expect(
        service.reject('g1', { id: 1, companyId: 1, roles: ['CEO'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unlinkApproved', () => {
    it('only CEO can unlink from admin panel', async () => {
      mockPrisma.telegramGroup.findUnique.mockResolvedValue({
        id: 'g1',
        companyId: 1001,
        deletedAt: null,
      });
      await expect(
        service.unlinkApproved('g1', {
          companyId: 1001,
          roles: ['Branch Director'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('CEO cannot unlink other companies groups', async () => {
      mockPrisma.telegramGroup.findUnique.mockResolvedValue({
        id: 'g1',
        companyId: 9999,
        deletedAt: null,
      });
      await expect(
        service.unlinkApproved('g1', { companyId: 1001, roles: ['CEO'] }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('onBotAddedToGroup', () => {
    it('upserts as PENDING with addedByTelegramUserId', async () => {
      mockPrisma.telegramGroup.upsert.mockResolvedValue({ id: 'new' });
      await service.onBotAddedToGroup({
        chatId: BigInt(-555),
        title: 'New Group',
        addedByTelegramUserId: BigInt(1647226871),
      });
      expect(mockPrisma.telegramGroup.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chatId: BigInt(-555) },
          create: expect.objectContaining({
            status: TelegramGroupStatus.PENDING,
            addedByTelegramUserId: BigInt(1647226871),
          }),
        }),
      );
    });
  });
});
