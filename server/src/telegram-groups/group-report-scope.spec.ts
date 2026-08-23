import {
  branchLabelForGroup,
  isLegacyUnscopedGroup,
  reportBranchIdsForGroup,
} from './group-report-scope';

const NAMES = { 1: "Farg'ona filiali", 2: 'Namangan filiali' };

describe('reportBranchIdsForGroup', () => {
  it('confines a branch-scoped group to its own branch', () => {
    expect(
      reportBranchIdsForGroup({ branchId: 1, receivesAllBranches: false }),
    ).toEqual([1]);
  });

  it('lets a declared org-wide group see every branch', () => {
    expect(
      reportBranchIdsForGroup({ branchId: null, receivesAllBranches: true }),
    ).toBeNull();
  });

  it('honours receivesAllBranches even when a branch is also set', () => {
    // The flag is additive: it was granted by a CEO precisely to widen this
    // group, so a leftover branchId must not narrow it back.
    expect(
      reportBranchIdsForGroup({ branchId: 2, receivesAllBranches: true }),
    ).toBeNull();
  });

  it('falls back to company-wide for a legacy group with neither set', () => {
    // `approve()` rejects this combination today; rows that predate that rule
    // keep working rather than going silent.
    expect(
      reportBranchIdsForGroup({ branchId: null, receivesAllBranches: false }),
    ).toBeNull();
    expect(
      isLegacyUnscopedGroup({ branchId: null, receivesAllBranches: false }),
    ).toBe(true);
  });

  it('does not flag a properly configured group as legacy', () => {
    expect(
      isLegacyUnscopedGroup({ branchId: 1, receivesAllBranches: false }),
    ).toBe(false);
    expect(
      isLegacyUnscopedGroup({ branchId: null, receivesAllBranches: true }),
    ).toBe(false);
  });
});

describe('branchLabelForGroup', () => {
  it('names the branch a scoped group is confined to', () => {
    expect(
      branchLabelForGroup({ branchId: 2, receivesAllBranches: false }, NAMES),
    ).toBe('Namangan filiali');
  });

  it('falls back to the id when the branch name is unknown', () => {
    expect(
      branchLabelForGroup({ branchId: 9, receivesAllBranches: false }, NAMES),
    ).toBe('Filial #9');
  });

  it('says "Barcha filiallar" for an org-wide group', () => {
    expect(
      branchLabelForGroup({ branchId: null, receivesAllBranches: true }, NAMES),
    ).toBe('Barcha filiallar');
  });

  it('says "Barcha filiallar" for a legacy unscoped group', () => {
    expect(
      branchLabelForGroup(
        { branchId: null, receivesAllBranches: false },
        NAMES,
      ),
    ).toBe('Barcha filiallar');
  });

  it('never labels a scoped group as all-branches', () => {
    // The regression this guards: the Excel export hard-coded
    // 'Barcha filiallar' while the group was confined to one branch, so the
    // file's own header disagreed with its rows.
    const label = branchLabelForGroup(
      { branchId: 1, receivesAllBranches: false },
      NAMES,
    );
    expect(label).not.toBe('Barcha filiallar');
  });
});
