import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';
import { ExpenseQueryDto } from './dto/expense-query.dto';

describe('ExpensesController — role guards + export delegation', () => {
  let controller: ExpensesController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    create: jest.fn().mockResolvedValue({}),
    findAll: jest.fn().mockResolvedValue({ data: [] }),
    exportAll: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({ message: '' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [{ provide: ExpensesService, useValue: mockService }],
    }).compile();

    controller = module.get(ExpensesController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => ExpensesController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  it('restricts the controller to CEO, Branch Director, Administrator at class level', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, ExpensesController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });

  describe('export endpoint', () => {
    it('allows CEO / Branch Director / Administrator', () => {
      for (const role of ['CEO', 'Branch Director', 'Administrator']) {
        const ctx = mockExecutionContext(controller.exportAll, [role]);
        expect(guard.canActivate(ctx)).toBe(true);
      }
    });

    it('denies Cashier and Teacher', () => {
      for (const role of ['Cashier', 'Teacher']) {
        const ctx = mockExecutionContext(controller.exportAll, [role]);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    });

    it('delegates to service.exportAll with the query and companyId', async () => {
      const query = { category: undefined } as ExpenseQueryDto;
      await controller.exportAll(query, 42);
      expect(mockService.exportAll).toHaveBeenCalledWith(query, 42);
    });
  });
});
