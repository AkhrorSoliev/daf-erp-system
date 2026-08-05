import { singleBranchId } from '../common/finance/report-branch-scope';

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
