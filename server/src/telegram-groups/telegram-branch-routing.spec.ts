/**
 * Which Telegram groups receive which events.
 *
 * The broadcast filter used to be
 *
 *     branchId ? { OR: [{ branchId }, { branchId: null }] } : {}
 *
 * so a group with no branch received EVERY branch's operational events —
 * payments, attendance, debt, the 21:00 financial report. With one branch that
 * was invisible. In production every approved group was branch-less when the
 * audit ran, so the leak was total rather than theoretical.
 *
 * The rule now has three cases, not two, and they are deliberately different.
 */
describe('telegram branch routing', () => {
  /** Mirrors the `where` the broadcast service builds. */
  function recipients(
    eventBranchId: number | null,
    groups: { title: string; branchId: number | null }[],
  ) {
    if (eventBranchId == null) return groups; // company-level → everyone
    return groups.filter((g) => g.branchId === eventBranchId);
  }

  const fargonaGroup = { title: 'Moliya-DaF Fergana', branchId: 1 };
  const namanganGroup = { title: 'Moliya-DaF Namangan', branchId: 2 };
  const unmapped = { title: 'eski guruh', branchId: null };
  const all = [fargonaGroup, namanganGroup, unmapped];

  describe('branch-specific operational events', () => {
    it("a Fargona event does NOT reach Namangan's group", () => {
      expect(recipients(1, all)).toEqual([fargonaGroup]);
    });

    it("a Namangan event does NOT reach Fargona's group", () => {
      expect(recipients(2, all)).toEqual([namanganGroup]);
    });

    it('an unmapped group receives NEITHER — fail-closed', () => {
      // Silence is recoverable; sending Fargona's financial report into a group
      // that may contain Namangan staff is not. An unmapped group simply gets
      // no branch events until someone assigns it a branch.
      expect(recipients(1, all)).not.toContain(unmapped);
      expect(recipients(2, all)).not.toContain(unmapped);
    });
  });

  describe('company-level events', () => {
    it('reach every approved group, including unmapped ones', () => {
      // Product announcements are global by design
      // (`telegram-group-announcement.service.ts`). Removing the null arm
      // wholesale would have broken this — which is why the fix distinguishes
      // the EVENT's branch rather than the GROUP's.
      expect(recipients(null, all)).toEqual(all);
    });
  });

  it('the old rule would have leaked — kept as the regression it fixes', () => {
    const oldRule = (eventBranchId: number | null) =>
      eventBranchId == null
        ? all
        : all.filter((g) => g.branchId === eventBranchId || g.branchId === null);

    // Under the old rule a Fargona-only event reached the unmapped group too.
    expect(oldRule(1)).toContain(unmapped);
    expect(recipients(1, all)).not.toContain(unmapped);
  });
});
