import { StudentsReadService } from '../../students/students-read.service';
import { GroupsReadService } from '../../groups/groups-read.service';
import { TeachersService } from '../../teachers/teachers.service';
import { UsersService } from '../../users/users.service';
import { RoomsService } from '../../rooms/rooms.service';
import { CoursesService } from '../../courses/courses.service';
import { BranchesService } from '../../branches/branches.service';

/**
 * Every operational LIST used to take `?branch_id=` as a WIDENING filter:
 * omitting it returned the whole company, and naming another branch returned
 * that branch. `@Roles()` proved the caller was staff; nothing proved the rows
 * were theirs. A Namangan administrator could read Fargona's entire roster.
 *
 * These tests assert the branch predicate reaches the QUERY. Asserting that a
 * service "accepts a scope parameter" would pass while the parameter went
 * unused — which is exactly the shape of the original defect (`buildWhere`
 * accepted a branch filter and dropped it for months).
 */
describe('operational reads are branch-confined', () => {
  const FARGONA = [1];
  const NAMANGAN = [2];

  /** Deep-search a Prisma `where` for a branch predicate naming these ids. */
  function mentionsBranches(where: unknown, ids: number[]): boolean {
    const target = JSON.stringify(ids);
    const walk = (node: any): boolean => {
      if (node == null || typeof node !== 'object') return false;
      for (const [key, value] of Object.entries(node)) {
        if (
          (key === 'branchId' || key === 'mainBranch' || key === 'id') &&
          value &&
          typeof value === 'object' &&
          'in' in (value as any) &&
          JSON.stringify((value as any).in) === target
        ) {
          return true;
        }
        if (walk(value)) return true;
      }
      return false;
    };
    return walk(where);
  }

  describe('StudentsReadService.findAll', () => {
    function make() {
      const calls: any[] = [];
      const prisma: any = {
        student: {
          findMany: jest.fn((a) => (calls.push(a.where), Promise.resolve([]))),
          count: jest.fn((a) => (calls.push(a?.where), Promise.resolve(0))),
        },
        transaction: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      return {
        service: new StudentsReadService(prisma, {} as any),
        calls,
      };
    }

    it('filters by the resolved scope', async () => {
      const { service, calls } = make();
      await service.findAll({} as any, 1001, NAMANGAN);
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((w) => mentionsBranches(w, NAMANGAN))).toBe(true);
    });

    it('IGNORES query.branch_id — the scope is the only source', async () => {
      const { service, calls } = make();
      // A Namangan director hand-editing the parameter to Fargona: the guard
      // already resolved this to Namangan, and the raw parameter must not win.
      await service.findAll({ branch_id: 1 } as any, 1001, NAMANGAN);
      expect(calls.some((w) => mentionsBranches(w, FARGONA))).toBe(false);
      expect(calls.every((w) => mentionsBranches(w, NAMANGAN))).toBe(true);
    });

    it('applies no filter for a CEO who picked no branch (null scope)', async () => {
      const { service, calls } = make();
      await service.findAll({} as any, 1001, null);
      expect(calls.every((w) => !mentionsBranches(w, NAMANGAN))).toBe(true);
    });

    it('an EMPTY scope yields an impossible predicate, not the whole company', async () => {
      const { service, calls } = make();
      await service.findAll({} as any, 1001, []);
      // `{ in: [] }` is false for every row — fail-closed, per report-branch-scope.
      expect(calls.every((w) => mentionsBranches(w, []))).toBe(true);
    });
  });

  describe('GroupsReadService.findAll', () => {
    it('scopes the list and the stats counters alike', async () => {
      const calls: any[] = [];
      const prisma: any = {
        group: {
          findMany: jest.fn((a) => (calls.push(a.where), Promise.resolve([]))),
          count: jest.fn((a) => (calls.push(a?.where), Promise.resolve(0))),
          groupBy: jest.fn((a) => (calls.push(a?.where), Promise.resolve([]))),
        },
        enrollment: { count: jest.fn(() => Promise.resolve(0)) },
        groupTeacher: {
          groupBy: jest.fn((a) => (calls.push(a?.where), Promise.resolve([]))),
        },
      };
      const service = new GroupsReadService(prisma, {} as any);
      await service.findAll({ branch_id: 1 } as any, 1001, NAMANGAN);
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((w) => mentionsBranches(w, NAMANGAN))).toBe(true);
    });
  });

  describe('TeachersService.findAll', () => {
    function make() {
      let captured: any;
      const prisma: any = {
        user: {
          findMany: jest.fn((a) => ((captured = a.where), Promise.resolve([]))),
          count: jest.fn().mockResolvedValue(0),
        },
        groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
        enrollment: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      const service = new TeachersService(
        prisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      return { service, where: () => captured };
    }

    it('confines to the scope (D6 — one teacher, one branch)', async () => {
      const { service, where } = make();
      await service.findAll({} as any, 1001, NAMANGAN);
      expect(mentionsBranches(where(), NAMANGAN)).toBe(true);
    });

    it('KEEPS the branch confinement when a search term is present', async () => {
      // Regression: `userBranchWhere` and the search filter both produce an
      // `OR`. Spread at the same level, the search assignment erased the branch
      // predicate — so searching returned every branch's teachers.
      const { service, where } = make();
      await service.findAll({ search: 'Ali' } as any, 1001, NAMANGAN);
      expect(mentionsBranches(where(), NAMANGAN)).toBe(true);
      expect(where().OR).toBeDefined();
    });
  });

  describe('UsersService.findAll', () => {
    it('keeps the branch confinement alongside a search term', async () => {
      let captured: any;
      const prisma: any = {
        user: {
          findMany: jest.fn((a) => ((captured = a.where), Promise.resolve([]))),
        },
        groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
        enrollment: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      // UsersService takes four collaborators; the fifth was left over from an
      // older signature and only ever compiled because jest does not typecheck.
      const service = new UsersService(prisma, {} as any, {} as any, {} as any);
      await service.findAll({ search: 'Ali' } as any, 1001, NAMANGAN);
      expect(mentionsBranches(captured, NAMANGAN)).toBe(true);
    });
  });

  describe('RoomsService / CoursesService', () => {
    it('rooms list is scoped', async () => {
      let captured: any;
      const prisma: any = {
        room: {
          findMany: jest.fn((a) => ((captured = a.where), Promise.resolve([]))),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      // RoomsService takes four collaborators, same as UsersService above.
      const service = new RoomsService(prisma, {} as any, {} as any, {} as any);
      await service.findAll({ branch_id: 1 } as any, 1001, NAMANGAN);
      expect(mentionsBranches(captured, NAMANGAN)).toBe(true);
    });

    it('courses list is scoped', async () => {
      let captured: any;
      const prisma: any = {
        course: {
          findMany: jest.fn((a) => ((captured = a.where), Promise.resolve([]))),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new CoursesService(
        prisma,
        {} as any,
        {} as any,
        {} as any,
      );
      await service.findAll({ branch_id: 1 } as any, 1001, NAMANGAN);
      expect(mentionsBranches(captured, NAMANGAN)).toBe(true);
    });
  });

  describe('BranchesService — the switcher option list', () => {
    function make() {
      let captured: any;
      const prisma: any = {
        branch: {
          findMany: jest.fn((a) => ((captured = a.where), Promise.resolve([]))),
          findFirst: jest.fn(
            (a) => ((captured = a.where), Promise.resolve(null)),
          ),
        },
      };
      const service = new BranchesService(
        prisma,
        {} as any,
        {} as any,
        {} as any,
      );
      return { service, where: () => captured };
    }

    it('lists only the branches the caller may see', async () => {
      const { service, where } = make();
      await service.findAll({} as any, 1001, NAMANGAN);
      expect(mentionsBranches(where(), NAMANGAN)).toBe(true);
    });

    it('lists every branch for a CEO', async () => {
      const { service, where } = make();
      await service.findAll({} as any, 1001, null);
      expect(where()).toEqual({ deletedAt: null, companyId: 1001 });
    });

    it('findOne keeps the requested id AND the scope — the scope must not replace it', async () => {
      // Regression: both predicates target `id`. Spreading the scope over the
      // requested id returned whichever branch the caller owned instead of the
      // one they asked for.
      const { service, where } = make();
      await service.findOne(7, 1001, NAMANGAN).catch(() => undefined);
      expect(where().id).toBe(7);
      expect(mentionsBranches(where().AND, NAMANGAN)).toBe(true);
    });
  });
});
