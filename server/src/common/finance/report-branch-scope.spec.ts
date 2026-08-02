import {
  branchIdWhere,
  isEmptyScope,
  resolveReportBranchIds,
  singleBranchId,
  studentBranchWhere,
  userBranchWhere,
} from './report-branch-scope';

describe('resolveReportBranchIds', () => {
  describe('CEO (null ceiling)', () => {
    it('is unfiltered when no branch is picked', () => {
      expect(resolveReportBranchIds(null)).toBeNull();
    });

    it('honours the picked branch', () => {
      expect(resolveReportBranchIds(null, 2)).toEqual([2]);
    });
  });

  describe('scoped caller', () => {
    it('defaults to their whole scope — a multi-branch admin works in each', () => {
      expect(resolveReportBranchIds([1, 2])).toEqual([1, 2]);
    });

    it('NARROWS to the picked branch rather than being overridden by it', () => {
      // The old `branchWhere` let the caller's scope win, so picking Namangan
      // silently returned Fargona + Namangan under a "Namangan" header.
      expect(resolveReportBranchIds([1, 2], 2)).toEqual([2]);
    });

    it('returns NOTHING for a branch outside the ceiling', () => {
      // Not "fall back to their scope" — that would answer a question the
      // caller did not ask under a header naming the one they did.
      expect(resolveReportBranchIds([1, 2], 3)).toEqual([]);
    });

    it('returns nothing for a caller with no branch attached', () => {
      // Fail closed. Two production Administrators had a NULL mainBranch, and
      // the old collapse-to-no-filter rule handed them every branch's money.
      expect(resolveReportBranchIds([])).toEqual([]);
      expect(resolveReportBranchIds([], 1)).toEqual([]);
    });
  });

  it('treats a missing/null requested branch as "not picked"', () => {
    expect(resolveReportBranchIds([1, 2], undefined)).toEqual([1, 2]);
    expect(resolveReportBranchIds([1, 2], null)).toEqual([1, 2]);
    expect(resolveReportBranchIds(null, null)).toBeNull();
  });

  it('keeps branch 0 addressable rather than treating it as absent', () => {
    // Guards against a `if (branchId)` truthiness check creeping back in.
    expect(resolveReportBranchIds(null, 0)).toEqual([0]);
  });
});

describe('where fragments', () => {
  it('emit no predicate for an unfiltered scope', () => {
    expect(branchIdWhere(null)).toEqual({});
    expect(studentBranchWhere(null)).toEqual({});
    expect(userBranchWhere(null)).toEqual({});
  });

  it('filter a branch-carrying row directly', () => {
    expect(branchIdWhere([2])).toEqual({ branchId: { in: [2] } });
  });

  it('filter students through the StudentBranch join, like every student list', () => {
    expect(studentBranchWhere([2])).toEqual({
      branches: { some: { branchId: { in: [2] } } },
    });
  });

  it('match an employee by mainBranch OR a UserBranch row', () => {
    expect(userBranchWhere([2])).toEqual({
      OR: [
        { mainBranch: { in: [2] } },
        { branches: { some: { branchId: { in: [2] } } } },
      ],
    });
  });

  it('compile an empty scope to a false predicate, not an absent one', () => {
    // `{ in: [] }` matches nothing — the difference between showing a
    // scopeless director zeros and showing them the whole company.
    expect(branchIdWhere([])).toEqual({ branchId: { in: [] } });
    expect(studentBranchWhere([])).toEqual({
      branches: { some: { branchId: { in: [] } } },
    });
  });
});

describe('isEmptyScope', () => {
  it('flags a confined caller with no branch', () => {
    expect(isEmptyScope([])).toBe(true);
  });

  it('does not flag an unfiltered or populated scope', () => {
    expect(isEmptyScope(null)).toBe(false);
    expect(isEmptyScope([1])).toBe(false);
  });
});

describe('singleBranchId', () => {
  it('names the branch when the scope is exactly one', () => {
    expect(singleBranchId([2])).toBe(2);
  });

  it('is undefined for an unfiltered or multi-branch scope', () => {
    expect(singleBranchId(null)).toBeUndefined();
    expect(singleBranchId([1, 2])).toBeUndefined();
  });

  it('is undefined for an empty scope — callers MUST guard with isEmptyScope', () => {
    // `undefined` means "no branch filter" downstream, so relying on this
    // alone would hand a scopeless director the whole company. The guard is
    // the caller's job; this test documents why.
    expect(singleBranchId([])).toBeUndefined();
    expect(isEmptyScope([])).toBe(true);
  });
});
