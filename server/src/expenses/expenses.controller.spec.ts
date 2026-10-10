import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../prisma/prisma.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { ExpenseQueryDto } from './dto/expense-query.dto';

describe('ExpensesController — route access', () => {
  const READS = ['findAll', 'exportPdf'] as const;
  const WRITES = ['create', 'update', 'remove'] as const;

  it.each(READS)('%s is gated by the expenses view capability', (name) => {
    expect(routeAccess(ExpensesController, name)).toEqual({
      kind: 'can',
      keys: ['expenses.view'],
    });
  });

  it.each(WRITES)('%s is gated by the expenses manage capability', (name) => {
    expect(routeAccess(ExpensesController, name)).toEqual({
      kind: 'can',
      keys: ['expenses.manage'],
    });
  });

  it.each([...READS, ...WRITES])(
    '%s admits the Branch Director and the CEO by default, not the Administrator, Cashier or Teacher',
    (name) => {
      expect(defaultRolesOf(ExpensesController, name)).toEqual([
        'Branch Director',
        'CEO',
      ]);
    },
  );
});

describe('ExpensesController — export delegation', () => {
  let controller: ExpensesController;

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
  });

  describe('pdf endpoint', () => {
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
