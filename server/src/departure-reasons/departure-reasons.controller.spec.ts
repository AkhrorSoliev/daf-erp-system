import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DepartureReasonsController } from './departure-reasons.controller';
import { DepartureReasonsService } from './departure-reasons.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('DepartureReasonsController — role guards', () => {
  let controller: DepartureReasonsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepartureReasonsController],
      providers: [{ provide: DepartureReasonsService, useValue: mockService }],
    }).compile();

    controller = module.get(DepartureReasonsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => DepartureReasonsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('class-level @Roles', () => {
    it('has @Roles(CEO, Branch Director, Administrator) on the controller class', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        DepartureReasonsController,
      );
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });
  });

  const endpoints = ['findAll', 'create', 'update', 'remove'] as const;

  for (const method of endpoints) {
    describe(`${method}()`, () => {
      it('allows CEO', () => {
        const ctx = mockExecutionContext(controller[method], ['CEO']);
        expect(guard.canActivate(ctx)).toBe(true);
      });
      it('allows Branch Director', () => {
        const ctx = mockExecutionContext(controller[method], [
          'Branch Director',
        ]);
        expect(guard.canActivate(ctx)).toBe(true);
      });
      it('allows Administrator', () => {
        const ctx = mockExecutionContext(controller[method], ['Administrator']);
        expect(guard.canActivate(ctx)).toBe(true);
      });
      it('denies Cashier', () => {
        const ctx = mockExecutionContext(controller[method], ['Cashier']);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      });
      it('denies Teacher', () => {
        const ctx = mockExecutionContext(controller[method], ['Teacher']);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      });
    });
  }
});
