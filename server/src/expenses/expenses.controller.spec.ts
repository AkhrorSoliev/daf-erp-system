import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';
import { ExpenseQueryDto } from './dto/expense-query.dto';

describe('ExpensesController — role guards + export delegation', () => {
  let controller: ExpensesController;
  let reflector: Reflector;
  let guard: RolesGuard;

  // A CEO caller: `resolveCallerBranchScope` returns { kind: 'all' }, so the
  // resolved report scope is null (every branch).
  const mockPrisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'CEO' } }],
      }),
    },
  };

  const mockService = {
    create: jest.fn().mockResolvedValue({}),
    findAll: jest.fn().mockResolvedValue({ data: [] }),
    generateExpensesPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({ message: '' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [
        { provide: ExpensesService, useValue: mockService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
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

  it('restricts the controller to CEO, Branch Director at class level', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, ExpensesController);
    expect(roles).toEqual(['CEO', 'Branch Director']);
  });

  describe('pdf endpoint', () => {
    it('allows CEO / Branch Director', () => {
      for (const role of ['CEO', 'Branch Director']) {
        const ctx = mockExecutionContext(controller.exportPdf, [role]);
        expect(guard.canActivate(ctx)).toBe(true);
      }
    });

    it('denies Administrator, Cashier and Teacher', () => {
      for (const role of ['Administrator', 'Cashier', 'Teacher']) {
        const ctx = mockExecutionContext(controller.exportPdf, [role]);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    });

    it('streams a PDF: delegates to generateExpensesPdf and sets headers', async () => {
      const query = {} as ExpenseQueryDto;
      const headers: Record<string, string | number> = {};
      let body: Buffer | undefined;
      const res = {
        setHeader: (k: string, v: string | number) => {
          headers[k] = v;
        },
        end: (b: Buffer) => {
          body = b;
        },
      } as any;

      await controller.exportPdf(query, 42, 7, res);

      // The resolved branch scope travels WITH the filters — the page and the
      // PDF must never be scoped differently.
      expect(mockService.generateExpensesPdf).toHaveBeenCalledWith(
        query,
        42,
        null,
      );
      expect(headers['Content-Type']).toBe('application/pdf');
      expect(String(headers['Content-Disposition'])).toContain('attachment');
      expect(body).toBeDefined();
      expect(body!.toString().startsWith('%PDF')).toBe(true);
    });
  });
});
