import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('CompanyController — role guards', () => {
  let controller: CompanyController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanyController],
      providers: [
        { provide: CompanyService, useValue: mockService },
      ],
    }).compile();

    controller = module.get(CompanyController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(handler: Function, roles: string[]) {
    return {
      getHandler: () => handler,
      getClass: () => CompanyController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('update()', () => {
    it('should have @Roles(CEO) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.update);
      expect(roles).toEqual(['CEO']);
    });

    it('should allow CEO to update', () => {
      const ctx = mockExecutionContext(controller.update, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Administrator from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Administrator']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Branch Director from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Branch Director']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('findAll() — no guard', () => {
    it('should NOT have @Roles metadata (open to all authenticated users)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findAll);
      expect(roles).toBeUndefined();
    });
  });

  describe('findOne() — no guard', () => {
    it('should NOT have @Roles metadata (open to all authenticated users)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findOne);
      expect(roles).toBeUndefined();
    });
  });
});
