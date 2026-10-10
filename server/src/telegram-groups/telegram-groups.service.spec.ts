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
import { PermissionsService } from '../common/permissions/permissions.service';
import { ROLE_ID } from '../common/auth/role-ids';
import { fakePermissions } from '../common/permissions/testing';

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

  // `roleIds` are the roles the caller holds in the database; the
  // capabilities they carry come from the catalog defaults.
  async function serviceHeldBy(roleIds: number[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EntityHistoryService, useValue: mockHistory },
        { provide: PermissionsService, useValue: fakePermissions(roleIds) },
      ],
    }).compile();
    return module.get(TelegramGroupsService);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await serviceHeldBy([ROLE_ID.CEO]);
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

    it('rejects callers without the Telegram groups capability', async () => {
      const administrator = await serviceHeldBy([ROLE_ID.ADMINISTRATOR]);
      await expect(
        administrator.approve('g1', {
          id: 1,
          companyId: 1001,
          roles: ['Administrator'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a Branch Director passes the capability check but still cannot make a group watch every branch (CEO identity)', async () => {
      const director = await serviceHeldBy([ROLE_ID.BRANCH_DIRECTOR]);
      mockPrisma.telegramGroup.findUnique.mockResolvedValue(baseGroup);
      await expect(
        director.approve(
          'g1',
          { id: 2, companyId: 1001, roles: ['Branch Director'] },
          null,
          true,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.telegramGroup.update).not.toHaveBeenCalled();
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
    it('rejects callers without the Telegram groups capability', async () => {
      const administrator = await serviceHeldBy([ROLE_ID.ADMINISTRATOR]);
      await expect(
        administrator.reject('g1', {
          id: 1,
          companyId: 1,
          roles: ['Administrator'],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.telegramGroup.findUnique).not.toHaveBeenCalled();
    });

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
    it('only a caller holding the announce capability can unlink from admin panel', async () => {
      mockPrisma.telegramGroup.findUnique.mockResolvedValue({
        id: 'g1',
        companyId: 1001,
        deletedAt: null,
      });
      const director = await serviceHeldBy([ROLE_ID.BRANCH_DIRECTOR]);
      await expect(
        director.unlinkApproved('g1', {
          id: 2,
          companyId: 1001,
          roles: ['Branch Director'],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.telegramGroup.update).not.toHaveBeenCalled();
    });

    it('CEO unlinks a group of their own company', async () => {
      mockPrisma.telegramGroup.findUnique.mockResolvedValue({
        id: 'g1',
        companyId: 1001,
        deletedAt: null,
      });
      mockPrisma.telegramGroup.update.mockResolvedValue({ id: 'g1' });
      await service.unlinkApproved('g1', {
        id: 1,
        companyId: 1001,
        roles: ['CEO'],
      });
      expect(mockPrisma.telegramGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('CEO cannot unlink other companies groups', async () => {
      mockPrisma.telegramGroup.findUnique.mockResolvedValue({
        id: 'g1',
        companyId: 9999,
        deletedAt: null,
      });
      await expect(
        service.unlinkApproved('g1', {
          id: 1,
          companyId: 1001,
          roles: ['CEO'],
        }),
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
