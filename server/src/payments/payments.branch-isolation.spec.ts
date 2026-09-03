import { NotFoundException } from '@nestjs/common';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsDebtorsService } from './payments-debtors.service';
import { PaymentsPreviewService } from './payments-preview.service';
import { PaymentsFrozenBalanceService } from './payments-frozen-balance.service';
import { TransactionsReadService } from '../transactions/transactions-read.service';

/**
 * Does this `where` confine to exactly these branch ids?
 *
 * Exported so every branch-scope spec in this module uses the SAME check
 * rather than each writing its own (weaker) shape — a loose assertion like
 * `JSON.stringify(where).includes('branch')` can pass on a hardcoded WRONG
 * branch id and never catch a leak.
 */
export function confinedTo(where: unknown, ids: number[]): boolean {
  const target = JSON.stringify(ids);
  const walk = (node: unknown): boolean => {
    if (node == null || typeof node !== 'object') return false;
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>,
    )) {
      if (
        (key === 'branchId' || key === 'mainBranch') &&
        value &&
        typeof value === 'object' &&
        'in' in value &&
        JSON.stringify(value.in) === target
      ) {
        return true;
      }
      if (walk(value)) return true;
    }
    return false;
  };
  return walk(where);
}

/**
 * Negative cross-branch tests for the money READ paths.
 *
 * These are the only real proof that the scope is enforced. A route can pass a
 * resolved scope into a service and the service can still forget to put it in
 * the `where` — types cannot see that, and a route registry cannot either. So
 * every branch-sensitive read gets a test that asks for the OTHER branch's data
 * and asserts it does not come back.
 *
 * Fargona = branch 1 (all real data), Namangan = branch 2 (starts empty).
 */
/**
 * `getPending` and `getDebtorsForGroup` never read debt ages; this keeps the
 * constructor satisfied without dragging the replay into a branch-scope test.
 */
const debtAgeStub = () =>
  ({ getDebtAges: jest.fn().mockResolvedValue(new Map()) }) as any;

describe('money reads are branch-isolated', () => {
  const FARGONA = [1];
  const NAMANGAN = [2];
  const COMPANY = 1001;

  describe('PaymentsReadService', () => {
    function make() {
      const wheres: any[] = [];
      const prisma: any = {
        payment: {
          findMany: jest.fn((a) => (wheres.push(a.where), Promise.resolve([]))),
          count: jest.fn((a) => (wheres.push(a?.where), Promise.resolve(0))),
          findFirst: jest.fn(
            (a) => (wheres.push(a.where), Promise.resolve(null)),
          ),
        },
      };
      return { service: new PaymentsReadService(prisma), wheres };
    }

    it('list is confined to the resolved scope', async () => {
      const { service, wheres } = make();
      await service.findAll({} as any, COMPANY, NAMANGAN);
      expect(wheres.every((w) => confinedTo(w, NAMANGAN))).toBe(true);
    });

    it('IGNORES query.branchId — a Namangan user asking for Fargona gets Namangan only', async () => {
      // The exact leak: `...(query.branchId && { branchId: query.branchId })`
      // took the client's word for it.
      const { service, wheres } = make();
      await service.findAll({ branchId: 1 } as any, COMPANY, NAMANGAN);
      expect(wheres.some((w) => confinedTo(w, FARGONA))).toBe(false);
      expect(wheres.every((w) => confinedTo(w, NAMANGAN))).toBe(true);
    });

    it('detail by id is confined — a foreign payment reads as NOT FOUND', async () => {
      const { service, wheres } = make();
      await expect(
        service.findOne('pay-in-fargona', COMPANY, NAMANGAN),
      ).rejects.toBeInstanceOf(NotFoundException);
      // 404 rather than 403: a 403 would confirm the id exists elsewhere, and
      // the payload carries the student's name and live balance.
      expect(confinedTo(wheres[0], NAMANGAN)).toBe(true);
    });

    it('student payment history is confined by the payment branch', async () => {
      const { service, wheres } = make();
      await service.findByStudent(10001, {} as any, COMPANY, NAMANGAN);
      expect(wheres.every((w) => confinedTo(w, NAMANGAN))).toBe(true);
    });

    it('a CEO with no branch picked is not filtered', async () => {
      const { service, wheres } = make();
      await service.findAll({} as any, COMPANY, null);
      expect(wheres.every((w) => !confinedTo(w, NAMANGAN))).toBe(true);
    });

    it('an EMPTY scope yields an impossible predicate, not the whole company', async () => {
      const { service, wheres } = make();
      await service.findAll({} as any, COMPANY, []);
      expect(wheres.every((w) => confinedTo(w, []))).toBe(true);
    });
  });

  describe('PaymentsPreviewService', () => {
    it('refuses to project a student outside the scope', async () => {
      let captured: any;
      const prisma: any = {
        student: {
          findFirst: jest.fn(
            (a) => ((captured = a.where), Promise.resolve(null)),
          ),
        },
      };
      const service = new PaymentsPreviewService(prisma);
      await expect(
        service.preview(10001, 500000, COMPANY, NAMANGAN),
      ).rejects.toThrow();
      // The projection reports balance + outstanding debt, so it is confined
      // the same way the student list is.
      expect(confinedTo(captured, NAMANGAN)).toBe(true);
    });
  });

  describe('PaymentsDebtorsService', () => {
    it('pending-students is confined (it returns names, phones, balances)', async () => {
      let captured: any;
      const prisma: any = {
        student: {
          findMany: jest.fn((a) => ((captured = a.where), Promise.resolve([]))),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new PaymentsDebtorsService(prisma, debtAgeStub());
      await service.getPending(COMPANY, { branchIds: NAMANGAN });
      expect(confinedTo(captured, NAMANGAN)).toBe(true);
    });

    it('group debtor roster is confined by the GROUP branch', async () => {
      let captured: any;
      const prisma: any = {
        group: {
          findFirst: jest.fn(
            (a) => ((captured = a.where), Promise.resolve(null)),
          ),
        },
      };
      const service = new PaymentsDebtorsService(prisma, debtAgeStub());
      await expect(
        service.getDebtorsForGroup('grp-fargona', COMPANY, NAMANGAN),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(confinedTo(captured, NAMANGAN)).toBe(true);
    });
  });

  describe('PaymentsFrozenBalanceService', () => {
    /**
     * `PaymentsFrozenBalanceService` resolves its own scope from the DB via
     * `resolveCallerReportBranchIds` → `resolveCallerBranchScope`
     * (`prisma.user.findFirst`), unlike `PaymentsDebtorsService.getPending`
     * above which takes an already-resolved `branchIds`. So the caller row
     * is mocked here rather than the scope being passed in directly.
     */
    const callerRow = (branchIds: number[]) => ({
      mainBranch: null,
      branches: branchIds.map((branchId) => ({ branchId })),
      roles: [{ role: { name: 'Branch Director' } }],
    });

    it('frozen-balances list is confined to the resolved scope', async () => {
      let captured: any;
      const prisma: any = {
        user: { findFirst: jest.fn().mockResolvedValue(callerRow(NAMANGAN)) },
        student: {
          findMany: jest.fn((a) => ((captured = a.where), Promise.resolve([]))),
          count: jest.fn().mockResolvedValue(0),
        },
        payment: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      const service = new PaymentsFrozenBalanceService(prisma);
      await service.getFrozenBalances(COMPANY, {
        userId: 20002,
        roles: ['Branch Director'],
      });
      expect(confinedTo(captured, NAMANGAN)).toBe(true);
    });

    it('an EMPTY resolved scope yields nothing, never the whole company', async () => {
      // A Branch Director with no branch attached — `resolveCallerBranchScope`
      // returns `{ kind: 'branches', branchIds: [] }`, which must short-circuit
      // to an empty result rather than falling back to every branch.
      const prisma: any = {
        user: { findFirst: jest.fn().mockResolvedValue(callerRow([])) },
        student: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        payment: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      const service = new PaymentsFrozenBalanceService(prisma);
      const result = await service.getFrozenBalances(COMPANY, {
        userId: 20003,
        roles: ['Branch Director'],
      });
      expect(result).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    });
  });

  describe('TransactionsReadService', () => {
    it('the aggregate list filters by the ROW branch and ignores query.branchId', async () => {
      const wheres: any[] = [];
      const prisma: any = {
        transaction: {
          findMany: jest.fn((a) => (wheres.push(a.where), Promise.resolve([]))),
          count: jest.fn((a) => (wheres.push(a?.where), Promise.resolve(0))),
        },
      };
      const service = new TransactionsReadService(prisma);
      await service.findAll({ branchId: 1 } as any, COMPANY, NAMANGAN);
      expect(wheres.some((w) => confinedTo(w, FARGONA))).toBe(false);
      expect(wheres.every((w) => confinedTo(w, NAMANGAN))).toBe(true);
    });

    it('a per-student ledger is gated on the STUDENT, then shown in full', async () => {
      // Deliberately different from the aggregate list: filtering the ROWS
      // would hide historical `branchId = null` movements and leave the
      // student's balance unexplained. Access is all-or-nothing per student.
      let studentWhere: any;
      let txWhere: any;
      const prisma: any = {
        student: {
          findFirst: jest.fn(
            (a) => ((studentWhere = a.where), Promise.resolve({ id: 10001 })),
          ),
        },
        transaction: {
          findMany: jest.fn((a) => ((txWhere = a.where), Promise.resolve([]))),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new TransactionsReadService(prisma);
      await service.findByStudent(10001, {} as any, COMPANY, NAMANGAN);

      expect(confinedTo(studentWhere, NAMANGAN)).toBe(true); // gate
      expect(confinedTo(txWhere, NAMANGAN)).toBe(false); // ledger not row-filtered
    });

    it("a foreign student's ledger reads as NOT FOUND", async () => {
      const prisma: any = {
        student: { findFirst: jest.fn().mockResolvedValue(null) },
        transaction: { findMany: jest.fn(), count: jest.fn() },
      };
      const service = new TransactionsReadService(prisma);
      await expect(
        service.findByStudent(10001, {} as any, COMPANY, NAMANGAN),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });

    it("a foreign teacher's ledger reads as NOT FOUND", async () => {
      const prisma: any = {
        user: { findFirst: jest.fn().mockResolvedValue(null) },
        transaction: { findMany: jest.fn(), count: jest.fn() },
      };
      const service = new TransactionsReadService(prisma);
      await expect(
        service.findByTeacher(10010, {} as any, COMPANY, NAMANGAN),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });

    it('the lesson trail is gated on the student too', async () => {
      const prisma: any = {
        student: { findFirst: jest.fn().mockResolvedValue(null) },
        transaction: { findMany: jest.fn(), count: jest.fn() },
      };
      const service = new TransactionsReadService(prisma);
      await expect(
        service.getLessonTrail(10001, COMPANY, NAMANGAN, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a CEO (null scope) skips the gate entirely', async () => {
      const prisma: any = {
        student: { findFirst: jest.fn() },
        transaction: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new TransactionsReadService(prisma);
      await service.findByStudent(10001, {} as any, COMPANY, null);
      expect(prisma.student.findFirst).not.toHaveBeenCalled();
    });
  });
});
