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
  interface Group {
    title: string;
    branchId: number | null;
    receivesAllBranches?: boolean;
  }

  /** Mirrors the `where` the broadcast service builds. */
  function recipients(eventBranchId: number | null, groups: Group[]) {
    if (eventBranchId == null) return groups; // company-level → everyone
    return groups.filter(
      (g) => g.branchId === eventBranchId || g.receivesAllBranches === true,
    );
  }

  const fargonaGroup: Group = { title: 'Moliya-DaF Fergana', branchId: 1 };
  const namanganGroup: Group = { title: 'Moliya-DaF Namangan', branchId: 2 };
  const unmapped: Group = { title: 'eski guruh', branchId: null };
  const orgWide: Group = {
    title: 'DaF Sprachzentrum Organisation',
    branchId: null,
    receivesAllBranches: true,
  };
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
        : all.filter(
            (g) => g.branchId === eventBranchId || g.branchId === null,
          );

    // Under the old rule a Fargona-only event reached the unmapped group too.
    expect(oldRule(1)).toContain(unmapped);
    expect(recipients(1, all)).not.toContain(unmapped);
  });

  /**
   * `branchId = null` used to mean two things at once: "nobody assigned this
   * group yet" and "this is the org-wide monitoring chat". Closing the leak
   * above made them indistinguishable and silenced the second kind — two
   * production groups went quiet for operational events with no way to say they
   * were meant to be loud. `receivesAllBranches` separates the two.
   */
  describe('an org-wide group declares itself', () => {
    const withOrg = [fargonaGroup, namanganGroup, unmapped, orgWide];

    it('receives EVERY branch event, not just one', () => {
      expect(recipients(1, withOrg).map((g) => g.title)).toContain(
        orgWide.title,
      );
      expect(recipients(2, withOrg).map((g) => g.title)).toContain(
        orgWide.title,
      );
    });

    it('does not stop the branch group from receiving its own event', () => {
      // The flag is ADDITIVE. If it narrowed anything, promoting an org group
      // would silently take a branch's own chat off its own traffic.
      expect(recipients(1, withOrg).map((g) => g.title)).toEqual(
        expect.arrayContaining([fargonaGroup.title, orgWide.title]),
      );
      expect(recipients(1, withOrg)).toHaveLength(2);
    });

    it('leaves a genuinely unassigned group silent', () => {
      // The whole point of the flag: it is a DECLARATION. A group that has not
      // made it stays fail-closed, so "not configured yet" cannot masquerade as
      // "watches everything".
      expect(recipients(1, withOrg).map((g) => g.title)).not.toContain(
        unmapped.title,
      );
      expect(recipients(2, withOrg).map((g) => g.title)).not.toContain(
        unmapped.title,
      );
    });

    it('still receives company-level announcements like everyone else', () => {
      expect(recipients(null, withOrg)).toHaveLength(4);
    });
  });
});
