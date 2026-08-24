import { ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  resolveReportBranchIds,
  narrowToSingleBranch,
  branchIdWhere,
  studentBranchWhere,
  userBranchWhere,
  groupBranchWhere,
  isEmptyScope,
} from '../finance/report-branch-scope';

/**
 * The scenarios the multi-branch work had to make true, written as the business
 * states them rather than per-module.
 *
 * Fargona (branch 1) carries every existing record; Namangan (branch 2) starts
 * empty. The two failure modes that matter are opposite and both silent:
 * Fargona data appearing in a Namangan view, and a Namangan view reading as
 * "nothing here" when it should read "you may not look".
 */
describe('branch isolation — end-to-end scenarios', () => {
  const FARGONA = 1;
  const NAMANGAN = 2;

  const ceo = null; // no ceiling
  const namanganDirector = [NAMANGAN];
  const fargonaDirector = [FARGONA];

  describe("a branch-limited user cannot reach another branch's data", () => {
    it('asking for Fargona as a Namangan director yields NOTHING', () => {
      const scope = resolveReportBranchIds(namanganDirector, FARGONA);
      expect(scope).toEqual([]);
      expect(isEmptyScope(scope)).toBe(true);
    });

    it('falls back to nothing, NOT to their own branch', () => {
      // Serving their own branch under a header naming the one they asked for
      // is worse than serving nothing: the numbers look valid and are labelled
      // with the wrong branch.
      const scope = resolveReportBranchIds(namanganDirector, FARGONA);
      expect(scope).not.toEqual(namanganDirector);
    });

    it('omitting the branch does not widen to the whole company', () => {
      expect(resolveReportBranchIds(namanganDirector, undefined)).toEqual([
        NAMANGAN,
      ]);
    });

    it('a user with no branch attached sees nothing, never everything', () => {
      expect(resolveReportBranchIds([], undefined)).toEqual([]);
      expect(resolveReportBranchIds([], FARGONA)).toEqual([]);
    });
  });

  describe('an empty scope compiles to an impossible predicate', () => {
    // `{ in: [] }` is false for every row. This is what makes fail-closed
    // actually closed rather than merely intended.
    it.each([
      ['ledger rows', branchIdWhere([])],
      ['students', studentBranchWhere([])],
      ['employees', userBranchWhere([])],
      ['group-owned rows', groupBranchWhere([])],
    ])('%s', (_label, where) => {
      expect(JSON.stringify(where)).toContain('[]');
    });
  });

  describe('Namangan starts empty — and empty must mean empty', () => {
    it('scopes every predicate family to Namangan alone', () => {
      expect(branchIdWhere([NAMANGAN])).toEqual({ branchId: { in: [2] } });
      expect(studentBranchWhere([NAMANGAN])).toEqual({
        branches: { some: { branchId: { in: [2] } } },
      });
      expect(groupBranchWhere([NAMANGAN])).toEqual({
        group: { branchId: { in: [2] } },
      });
      expect(userBranchWhere([NAMANGAN])).toEqual({
        OR: [
          { mainBranch: { in: [2] } },
          { branches: { some: { branchId: { in: [2] } } } },
        ],
      });
    });

    it('never produces a predicate mentioning Fargona', () => {
      const all = [
        branchIdWhere([NAMANGAN]),
        studentBranchWhere([NAMANGAN]),
        userBranchWhere([NAMANGAN]),
        groupBranchWhere([NAMANGAN]),
      ];
      for (const where of all) {
        expect(JSON.stringify(where)).not.toContain(String(FARGONA));
      }
    });
  });

  describe('a CEO keeps cross-branch visibility', () => {
    it('no filter at all when no branch is picked', () => {
      expect(resolveReportBranchIds(ceo, undefined)).toBeNull();
      expect(branchIdWhere(null)).toEqual({});
      expect(studentBranchWhere(null)).toEqual({});
      expect(userBranchWhere(null)).toEqual({});
      expect(groupBranchWhere(null)).toEqual({});
    });

    it('narrows to whichever branch they pick', () => {
      expect(resolveReportBranchIds(ceo, NAMANGAN)).toEqual([NAMANGAN]);
      expect(resolveReportBranchIds(ceo, FARGONA)).toEqual([FARGONA]);
    });
  });

  describe('the legacy single-branchId reports refuse what they cannot express', () => {
    const refuseEmpty = () => {
      throw new ForbiddenException();
    };
    const refuseAmbiguous = () => {
      throw new BadRequestException();
    };

    it('a CEO with no pick means "no filter"', () => {
      expect(
        narrowToSingleBranch(ceo, refuseEmpty, refuseAmbiguous),
      ).toBeUndefined();
    });

    it('one branch passes straight through', () => {
      expect(
        narrowToSingleBranch([NAMANGAN], refuseEmpty, refuseAmbiguous),
      ).toBe(NAMANGAN);
    });

    it('an empty scope is REFUSED, not served as zeros', () => {
      // Zeros would read as "this branch earned nothing" — a claim about the
      // business, not about permissions. Several of these services also
      // re-derive their own scope from `performedById`, so a zero-filled report
      // would still contain the caller's own branch in places.
      expect(() =>
        narrowToSingleBranch([], refuseEmpty, refuseAmbiguous),
      ).toThrow(ForbiddenException);
    });

    it('a multi-branch scope is REFUSED, not silently unfiltered', () => {
      expect(() =>
        narrowToSingleBranch([FARGONA, NAMANGAN], refuseEmpty, refuseAmbiguous),
      ).toThrow(BadRequestException);
    });
  });

  describe('the caller ceiling can only narrow, never widen', () => {
    it.each([
      ['CEO picks a branch', ceo, NAMANGAN, [NAMANGAN]],
      ['director picks their own', fargonaDirector, FARGONA, [FARGONA]],
      ['director picks a foreign one', fargonaDirector, NAMANGAN, []],
      ['director picks nothing', fargonaDirector, undefined, [FARGONA]],
    ])('%s', (_label, ceiling, requested, expected) => {
      expect(
        resolveReportBranchIds(ceiling as number[] | null, requested as number),
      ).toEqual(expected);
    });

    it('the result is never wider than the ceiling', () => {
      for (const requested of [undefined, FARGONA, NAMANGAN, 999]) {
        const scope = resolveReportBranchIds(fargonaDirector, requested);
        expect(scope).not.toBeNull();
        for (const id of scope as number[]) {
          expect(fargonaDirector).toContain(id);
        }
      }
    });
  });
});
