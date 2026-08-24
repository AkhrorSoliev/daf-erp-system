import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TelegramGroupsController } from './telegram-groups.controller';
import { TelegramGroupsService } from './telegram-groups.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupAnnouncementService } from './telegram-group-announcement.service';
import { RolesGuard } from '../common/guards';

describe('TelegramGroupsController — role guards', () => {
  let controller: TelegramGroupsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockGroupsService = {
    listPending: jest.fn().mockResolvedValue([]),
    listForCompany: jest.fn().mockResolvedValue([]),
    approve: jest.fn().mockResolvedValue({}),
    reject: jest.fn().mockResolvedValue({}),
    unlinkApproved: jest.fn().mockResolvedValue({}),
  };
  const mockBot = { getBot: jest.fn().mockReturnValue(null) };
  const mockAnnouncement = { broadcast: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramGroupsController],
      providers: [
        { provide: TelegramGroupsService, useValue: mockGroupsService },
        { provide: TelegramAdminBotService, useValue: mockBot },
        {
          provide: TelegramGroupAnnouncementService,
          useValue: mockAnnouncement,
        },
      ],
    }).compile();

    controller = module.get(TelegramGroupsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockCtx(handler: (...args: unknown[]) => unknown, roles: string[]) {
    return {
      getHandler: () => handler,
      getClass: () => TelegramGroupsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as any;
  }

  function expectAllowed(
    handler: (...a: unknown[]) => unknown,
    roles: string[],
  ) {
    expect(guard.canActivate(mockCtx(handler, roles))).toBe(true);
  }
  function expectDenied(
    handler: (...a: unknown[]) => unknown,
    roles: string[],
  ) {
    expect(() => guard.canActivate(mockCtx(handler, roles))).toThrow(
      ForbiddenException,
    );
  }

  it('listPending — CEO and Branch Director allowed; others denied', () => {
    expectAllowed(controller.listPending, ['CEO']);
    expectAllowed(controller.listPending, ['Branch Director']);
    expectDenied(controller.listPending, ['Administrator']);
    expectDenied(controller.listPending, ['Teacher']);
  });

  it('list (approved) — CEO/BD/Administrator allowed; Teacher/Cashier denied', () => {
    expectAllowed(controller.list, ['CEO']);
    expectAllowed(controller.list, ['Branch Director']);
    expectAllowed(controller.list, ['Administrator']);
    expectDenied(controller.list, ['Teacher']);
    expectDenied(controller.list, ['Cashier']);
  });

  it('approve — CEO and Branch Director only', () => {
    expectAllowed(controller.approve, ['CEO']);
    expectAllowed(controller.approve, ['Branch Director']);
    expectDenied(controller.approve, ['Administrator']);
    expectDenied(controller.approve, ['Cashier']);
  });

  it('reject — CEO and Branch Director only', () => {
    expectAllowed(controller.reject, ['CEO']);
    expectAllowed(controller.reject, ['Branch Director']);
    expectDenied(controller.reject, ['Administrator']);
  });

  it('unlink (delete) — CEO only', () => {
    expectAllowed(controller.unlink, ['CEO']);
    expectDenied(controller.unlink, ['Branch Director']);
    expectDenied(controller.unlink, ['Administrator']);
  });

  it('announce — CEO only (global product comms)', () => {
    expectAllowed(controller.announce, ['CEO']);
    expectDenied(controller.announce, ['Branch Director']);
    expectDenied(controller.announce, ['Administrator']);
    expectDenied(controller.announce, ['Cashier']);
  });
});
