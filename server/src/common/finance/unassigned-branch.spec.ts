import { branchIdWhere, studentBranchWhere } from './report-branch-scope';

/**
 * `branchId = null` on a financial row — the rules, pinned as tests.
 *
 * These columns stay nullable in this phase (`Payment`, `Transaction`,
 * `CashMovement`), so the meaning of a null row has to be defined NOW or the
 * reports either lose it silently or count it twice.
 *
 * Measured on production at the time of writing: `Payment` 0 nulls of 1 426,
 * `Transaction` 0 of 39 296, `CashMovement` 6 of 1 114. Those six are the rows
 * Batch 3 left null ON PURPOSE — the branch side of that money is already shown
 * through a compensating transfer, so attributing them too would double-count.
 *
 * The invariant is therefore NOT `Σ(branches) == total`. It is:
 *
 *     Σ(branch totals) + unassigned == company total
 */
describe('unassigned (branchId = null) financial rows', () => {
  const FARGONA = [1];
  const NAMANGAN = [2];

  it('are excluded from EVERY branch view', () => {
    // `{ in: [...] }` never matches NULL in SQL. That is the mechanism — not an
    // accident of Prisma, and the reason no branch total can absorb them.
    expect(branchIdWhere(FARGONA)).toEqual({ branchId: { in: [1] } });
    expect(branchIdWhere(NAMANGAN)).toEqual({ branchId: { in: [2] } });
  });

  it('are included exactly once in the company view', () => {
    // A CEO who picked no branch gets NO predicate at all, so every row —
    // including the null ones — is counted, and counted once.
    expect(branchIdWhere(null)).toEqual({});
    expect(studentBranchWhere(null)).toEqual({});
  });

  it('cannot be counted by two branches at once', () => {
    // The double-count the old plan text would have allowed: if a null row were
    // "visible to every branch", Fargona and Namangan would each add it.
    const fargona = branchIdWhere(FARGONA);
    const namangan = branchIdWhere(NAMANGAN);
    expect(fargona).not.toEqual(namangan);
    expect(JSON.stringify(fargona)).not.toContain('null');
    expect(JSON.stringify(namangan)).not.toContain('null');
  });

  it('an empty scope still yields nothing — not the unassigned bucket', () => {
    // A caller confined to no branch must not be handed the null rows as a
    // consolation prize.
    expect(branchIdWhere([])).toEqual({ branchId: { in: [] } });
  });

  describe('the invariant, computed the way a report computes it', () => {
    // Stand-in ledger: two branches plus one unattributed row.
    const rows = [
      { branchId: 1, amount: 500_000 },
      { branchId: 1, amount: 300_000 },
      { branchId: 2, amount: 200_000 },
      { branchId: null, amount: 120_000 }, // historical, unattributed
    ];

    const sumFor = (ids: number[] | null) =>
      rows
        .filter((r) =>
          ids == null ? true : r.branchId != null && ids.includes(r.branchId),
        )
        .reduce((s, r) => s + r.amount, 0);

    const unassigned = rows
      .filter((r) => r.branchId == null)
      .reduce((s, r) => s + r.amount, 0);

    it('Σ(branches) + unassigned == company total', () => {
      const company = sumFor(null);
      expect(sumFor([1]) + sumFor([2]) + unassigned).toBe(company);
      expect(company).toBe(1_120_000);
    });

    it('Σ(branches) alone does NOT equal the company total', () => {
      // The old invariant, kept as a test so nobody quietly restores it.
      expect(sumFor([1]) + sumFor([2])).not.toBe(sumFor(null));
    });

    it('the unassigned bucket is never zero-rated away', () => {
      expect(unassigned).toBe(120_000);
      expect(sumFor([1])).toBe(800_000);
      expect(sumFor([2])).toBe(200_000);
    });
  });
});
