import { singleBranchId } from '../common/finance/report-branch-scope';
import {
  narrowPayrollScope,
  type PayrollBranchScope,
} from './shared/payroll-branch-scope';

/**
 * `/salary/monthly` took NO branch input at all.
 *
 * The payroll resolver (`resolveMonthlyScope`) already handled a requested
 * branch correctly — a CEO's pick was honoured, a confined caller's mismatched
 * pick was blocked. It simply never received one, because the controller had no
 * `@BranchScope()`. So a CEO switching Fargona → Namangan saw the SAME
 * company-wide salary figures under a header naming Namangan: the reports
 * module's "cover says one branch, totals say another" defect, still live in
 * payroll.
 *
 * The three concepts the plan had to separate:
 *
 *   ceiling   — what the caller MAY see   (`common/auth/branch-scope.ts`)
 *   selection — what they ASKED to see    (`X-Branch-Id`)
 *   employee  — the payee's own branch    (`resolvePayrollBranchScope`)
 *
 * Only the first two belong in this conversion. The third stays where it is:
 * it answers "whose payroll is this?", not "which branch is being viewed?".
 */
describe('payroll branch selection', () => {
  it('passes a CEO picked branch through as a narrowing filter', () => {
    // The guard resolved ceiling(null for CEO) ∩ requested(2) → [2].
    expect(singleBranchId([2])).toBe(2);
  });

  it('passes undefined when a CEO picked no branch', () => {
    // `undefined` is the resolver's "no branch filter" — the consolidated view.
    expect(singleBranchId(null)).toBeUndefined();
  });

  it('yields a DIFFERENT filter per branch, so switching changes the numbers', () => {
    // The actual regression: both branches used to produce the same input.
    expect(singleBranchId([1])).not.toBe(singleBranchId([2]));
  });

  it('degrades to undefined for a multi-branch scope rather than guessing', () => {
    // The resolver takes exactly one branch. A multi-branch caller must not be
    // silently collapsed onto one of them; `resolveMonthlyScope` re-confines
    // such a caller from `performedById` instead.
    expect(singleBranchId([1, 2])).toBeUndefined();
  });

  it('an empty scope is not a branch — it must not read as "all"', () => {
    // `[]` means the caller asked for a branch outside their ceiling. It maps to
    // undefined here, which is why `resolveMonthlyScope` keeps its OWN
    // fail-closed check on `performedById` rather than trusting this value
    // alone.
    expect(singleBranchId([])).toBeUndefined();
  });
});

/**
 * The ceiling ∩ selection intersection itself, now shared by BOTH payroll
 * entry points.
 *
 * `/salary/monthly` had this logic inline in `resolveMonthlyScope`;
 * `/salary/overview` had none at all, so a CEO switching branch watched the
 * report change while the ⚙ Sozlamalar rate list kept listing every teacher in
 * the company. Two payroll screens, one branch switch, two answers — the same
 * class of split the reports module was rebuilt to remove.
 */
describe('narrowPayrollScope — ceiling ∩ selection', () => {
  const CEO: PayrollBranchScope = { kind: 'all' };
  const FARGONA_DIRECTOR: PayrollBranchScope = {
    kind: 'branches',
    branchIds: [1],
    mainBranch: 1,
  };
  // Attached to branches 1 and 2 (`UserBranch`), home branch 1.
  const TWO_BRANCH_DIRECTOR: PayrollBranchScope = {
    kind: 'branches',
    branchIds: [1, 2],
    mainBranch: 1,
  };
  const NO_BRANCH: PayrollBranchScope = { kind: 'none' };

  it('lets a CEO narrow to the branch they picked', () => {
    expect(narrowPayrollScope(CEO, 2)).toEqual({ branchId: 2, blocked: false });
  });

  it('gives a CEO who picked nothing every branch', () => {
    // `undefined` here means "no filter" downstream, which is correct ONLY
    // because the caller genuinely spans every branch.
    expect(narrowPayrollScope(CEO, undefined)).toEqual({
      branchId: undefined,
      blocked: false,
    });
  });

  it('yields a different filter per branch, so switching changes the figures', () => {
    expect(narrowPayrollScope(CEO, 1).branchId).not.toBe(
      narrowPayrollScope(CEO, 2).branchId,
    );
  });

  it('confines a director to their own branch when they pick nothing', () => {
    expect(narrowPayrollScope(FARGONA_DIRECTOR, undefined)).toEqual({
      branchId: 1,
      blocked: false,
    });
  });

  it('confines a director to their own branch when they pick it', () => {
    expect(narrowPayrollScope(FARGONA_DIRECTOR, 1)).toEqual({
      branchId: 1,
      blocked: false,
    });
  });

  it('REFUSES a director asking for another branch — it does not silently serve their own', () => {
    // Both halves matter. Serving Fargona's payroll under a header naming
    // Namangan is how a report comes to lie about whose money it shows; and
    // zeros would read as "Namangan paid nothing", which is a different claim
    // from "you may not look".
    const result = narrowPayrollScope(FARGONA_DIRECTOR, 2);
    expect(result.blocked).toBe(true);
    expect(result.branchId).not.toBe(2);
  });

  /**
   * A2.8 — a director attached to branches 1 and 2 who picked branch 2 got
   * `blocked`, because the ceiling was `mainBranch` alone. The net-profit
   * payroll leg then read 0 and the branch's profit looked too high. The
   * ceiling is the SET of branches attached to the caller; the pick chooses
   * within it.
   */
  describe('a director attached to several branches (A2.8)', () => {
    it('serves the branch they picked when it is one of theirs', () => {
      expect(narrowPayrollScope(TWO_BRANCH_DIRECTOR, 2)).toEqual({
        branchId: 2,
        blocked: false,
      });
    });

    it('serves their main branch when they pick it', () => {
      expect(narrowPayrollScope(TWO_BRANCH_DIRECTOR, 1)).toEqual({
        branchId: 1,
        blocked: false,
      });
    });

    it('REFUSES a branch outside their set, and serves no other branch in its place', () => {
      const result = narrowPayrollScope(TWO_BRANCH_DIRECTOR, 3);
      expect(result.blocked).toBe(true);
      expect(result.branchId).not.toBe(3);
    });

    it('answers with their main branch when they pick nothing (unchanged tiebreak)', () => {
      expect(narrowPayrollScope(TWO_BRANCH_DIRECTOR, undefined)).toEqual({
        branchId: 1,
        blocked: false,
      });
    });

    it('answers with the lowest attached branch when there is no main branch', () => {
      const attachedOnly: PayrollBranchScope = {
        kind: 'branches',
        branchIds: [2, 3],
        mainBranch: null,
      };
      expect(narrowPayrollScope(attachedOnly, undefined)).toEqual({
        branchId: 2,
        blocked: false,
      });
      expect(narrowPayrollScope(attachedOnly, 3)).toEqual({
        branchId: 3,
        blocked: false,
      });
    });

    it('an empty set is no scope at all — it must not read as "no filter"', () => {
      // The resolver turns an empty set into `none`; this guards a hand-built
      // one. `branchId: undefined, blocked: false` would mean "every branch".
      const empty: PayrollBranchScope = {
        kind: 'branches',
        branchIds: [],
        mainBranch: null,
      };
      expect(narrowPayrollScope(empty, undefined).blocked).toBe(true);
      expect(narrowPayrollScope(empty, 1).blocked).toBe(true);
    });
  });

  it('fails CLOSED when the caller has no branch at all', () => {
    // Two production Administrators had a null `mainBranch`. Collapsing that to
    // "no filter" is fail-OPEN: they could see, and `batchPay`, every branch's
    // salaries.
    expect(narrowPayrollScope(NO_BRANCH, undefined)).toEqual({
      branchId: undefined,
      blocked: true,
    });
    expect(narrowPayrollScope(NO_BRANCH, 1).blocked).toBe(true);
  });

  it('never returns an unblocked undefined branch for a confined caller', () => {
    // `undefined` means "no filter" downstream, so a confined caller reaching it
    // unblocked would see the whole company. This is the invariant the whole
    // helper exists to hold.
    const emptySet: PayrollBranchScope = {
      kind: 'branches',
      branchIds: [],
      mainBranch: null,
    };
    for (const requested of [undefined, 1, 2, 99]) {
      for (const scope of [
        FARGONA_DIRECTOR,
        TWO_BRANCH_DIRECTOR,
        emptySet,
        NO_BRANCH,
      ]) {
        const { branchId, blocked } = narrowPayrollScope(scope, requested);
        expect(blocked || branchId !== undefined).toBe(true);
      }
    }
  });
});
