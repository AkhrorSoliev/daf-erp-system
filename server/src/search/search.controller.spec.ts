import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('SearchController — role guards', () => {
  let controller: SearchController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    quickSearch: jest.fn().mockResolvedValue({}),
    fullSearch: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockService }],
    }).compile();

    controller = module.get(SearchController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => SearchController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('quickSearch()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.quickSearch);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow CEO to search', () => {
      const ctx = mockExecutionContext(controller.quickSearch, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Administrator to search', () => {
      const ctx = mockExecutionContext(controller.quickSearch, [
        'Administrator',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from searching', () => {
      const ctx = mockExecutionContext(controller.quickSearch, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from searching', () => {
      const ctx = mockExecutionContext(controller.quickSearch, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('fullSearch()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.fullSearch);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow Branch Director to search', () => {
      const ctx = mockExecutionContext(controller.fullSearch, [
        'Branch Director',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from searching', () => {
      const ctx = mockExecutionContext(controller.fullSearch, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
