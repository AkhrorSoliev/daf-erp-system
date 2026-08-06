import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('CallLogsController — role guards', () => {
  let controller: CallLogsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    create: jest.fn().mockResolvedValue({ id: 'c1' }),
    list: jest.fn().mockResolvedValue({ total: 0, items: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CallLogsController],
      providers: [{ provide: CallLogsService, useValue: mockService }],
    }).compile();

    controller = module.get(CallLogsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function ctx(roles: string[]) {
    return {
      getHandler: () => () => null,
      getClass: () => CallLogsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as any;
  }

  it('restricts to CEO, Branch Director, Administrator', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, CallLogsController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });

  it('allows CEO / Branch Director / Administrator', () => {
    expect(guard.canActivate(ctx(['CEO']))).toBe(true);
    expect(guard.canActivate(ctx(['Branch Director']))).toBe(true);
    expect(guard.canActivate(ctx(['Administrator']))).toBe(true);
  });

  it('denies Teacher and Cashier', () => {
    expect(() => guard.canActivate(ctx(['Teacher']))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(['Cashier']))).toThrow(ForbiddenException);
  });

  describe('handler wiring', () => {
    it('create delegates with user context', async () => {
      const dto = { studentId: 10264, reason: 'ABSENCE', outcome: 'ANSWERED' } as any;
      await controller.create(dto, 10001, 1);
      expect(mockService.create).toHaveBeenCalledWith(dto, 10001, 1);
    });

    it('list delegates with user context, roles and query', async () => {
      const query = { page: 1, pageSize: 20 } as any;
      await controller.list(query, 10001, 1, ['Branch Director'], [2]);
      expect(mockService.list).toHaveBeenCalledWith({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
        branchScope: [2],
        query,
      });
    });
  });
});
