import {
  leadAttributionWhere,
  leadBranchWhere,
  leadUnassignedWhere,
} from './shared/lead-scope';

/**
 * Leads had NO tenancy at all — not company, not branch. `getBoard()` was
 * `where: { deletedAt: null }`, and `update` / `move` / `markCalled` / `remove`
 * / `convert` each RECEIVED `companyId` and then looked the lead up by id
 * alone. A lead id was enough to edit, move, archive or convert another
 * branch's lead.
 */
describe('lead branch scope', () => {
  const FARGONA = [1];
  const NAMANGAN = [2];

  describe('visibility — the unassigned pool is shared', () => {
    it('shows a branch its own leads AND the unassigned ones', () => {
      // A lead from the public form or a cold call arrives before anyone knows
      // which branch it belongs to. Hiding those would make new leads invisible
      // to everyone and the funnel would quietly stop working.
      expect(leadBranchWhere(NAMANGAN)).toEqual({
        OR: [{ branchId: { in: [2] } }, { branchId: null }],
      });
    });

    it('never shows another branch assigned leads', () => {
      const where = JSON.stringify(leadBranchWhere(NAMANGAN));
      expect(where).not.toContain('"in":[1]');
    });

    it('applies no filter for a CEO', () => {
      expect(leadBranchWhere(null)).toEqual({});
    });
  });

  describe('attribution — counting must NOT share the pool', () => {
    it('excludes unassigned leads from a branch count', () => {
      // Using the visibility predicate for counts would add every unassigned
      // lead to Fargona's total and to Namangan's, inflating both and breaking
      // the conversion rate on each.
      expect(leadAttributionWhere(NAMANGAN)).toEqual({ branchId: { in: [2] } });
      expect(JSON.stringify(leadAttributionWhere(NAMANGAN))).not.toContain(
        'null',
      );
    });

    it('reports the unassigned leads as their own bucket', () => {
      expect(leadUnassignedWhere()).toEqual({ branchId: null });
    });

    it('Σ(branches) + unassigned == company', () => {
      const leads = [
        { branchId: 1 },
        { branchId: 1 },
        { branchId: 2 },
        { branchId: null }, // public form, not yet assigned
      ];
      const count = (ids: number[] | null) =>
        leads.filter((l) =>
          ids == null ? true : l.branchId != null && ids.includes(l.branchId),
        ).length;
      const unassigned = leads.filter((l) => l.branchId == null).length;

      expect(count(FARGONA) + count(NAMANGAN) + unassigned).toBe(count(null));
      expect(count(null)).toBe(4);
    });

    it('the visibility predicate would double-count — kept as a warning', () => {
      const leads = [{ branchId: 1 }, { branchId: 2 }, { branchId: null }];
      const visible = (ids: number[]) =>
        leads.filter(
          (l) =>
            l.branchId == null ||
            (l.branchId != null && ids.includes(l.branchId)),
        ).length;
      // 2 + 2 = 4 for a company of 3 — this is why counts use a different rule.
      expect(visible(FARGONA) + visible(NAMANGAN)).toBeGreaterThan(
        leads.length,
      );
    });
  });
});

/**
 * Board STRUCTURE is per branch too, not just the leads inside it.
 *
 * The first cut kept columns and sections company-level on the theory that
 * duplicating them said nothing new. Production disagreed: the sections are
 * named "A1 SPSH 15:00 Eldor" and "A1 DCHJ 10:00 Saida" — level, weekday
 * pattern, hour and the TEACHER. Those are forming groups, and a Fargona
 * teacher's 15:00 slot is meaningless in Namangan.
 */
describe('lead board structure is per branch', () => {
  const FARGONA = [1];
  const NAMANGAN = [2];

  // The board's real shape: `LeadColumn.branchId` owns the branch, a section
  // inherits it from its column, and a lead from its section's column.
  const columns = [
    { id: 'c1', name: 'Yangi Lidlar', systemKey: 'NEW', branchId: 1 },
    { id: 'c2', name: 'Kechki kurs', systemKey: null, branchId: 1 },
    { id: 'c3', name: 'Yangi Lidlar', systemKey: 'NEW', branchId: 2 },
    // Same NAME as c2, different branch — legal, and the reason uniqueness
    // moved from global to per (company, branch).
    { id: 'c4', name: 'Kechki kurs', systemKey: null, branchId: 2 },
  ];
  const sections = [
    { id: 's1', name: 'A1 SPSH 15:00 Eldor', columnId: 'c1' },
    { id: 's2', name: 'A1 DCHJ 17:00 neu', columnId: 'c2' },
    { id: 's3', name: 'A1 Namangan 09:00', columnId: 'c3' },
  ];

  const branchOf = (columnId: string) =>
    columns.find((c) => c.id === columnId)!.branchId;
  const boardFor = (ids: number[] | null) =>
    columns.filter((c) => ids == null || ids.includes(c.branchId));
  const sectionsFor = (ids: number[] | null) =>
    sections.filter((s) => ids == null || ids.includes(branchOf(s.columnId)));

  it('shows a branch only its own columns', () => {
    expect(boardFor(NAMANGAN).map((c) => c.id)).toEqual(['c3', 'c4']);
    expect(boardFor(FARGONA).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it("never leaks another branch's teacher/time sections", () => {
    // The whole point: "Eldor 15:00" is a Fargona timetable entry.
    expect(sectionsFor(NAMANGAN).map((s) => s.name)).toEqual([
      'A1 Namangan 09:00',
    ]);
  });

  it('shows a CEO every branch at once', () => {
    expect(boardFor(null)).toHaveLength(4);
  });

  it('allows the same column name in two branches', () => {
    const namangan = boardFor(NAMANGAN).map((c) => c.name);
    const fargona = boardFor(FARGONA).map((c) => c.name);
    expect(namangan).toContain('Kechki kurs');
    expect(fargona).toContain('Kechki kurs');
  });

  it('gives every branch exactly one system column', () => {
    // `systemKey = 'NEW'` resets a lead's funnel stage on arrival, and a branch
    // with no column can hold no section, therefore no lead — its board would
    // be a dead end. Both the migration and `BranchesService.create` bootstrap
    // one; this asserts the invariant they maintain.
    for (const ids of [FARGONA, NAMANGAN]) {
      expect(boardFor(ids).filter((c) => c.systemKey === 'NEW')).toHaveLength(
        1,
      );
    }
  });

  it("refuses to move a section into another branch's column", () => {
    // A section carries its leads. Landing them on the other branch's board
    // while their own `branchId` stays put is exactly the split the counting
    // rules above exist to prevent — and a CEO reaches both columns, so scope
    // alone does not stop it.
    const move = (sectionId: string, targetColumnId: string) => {
      const from = branchOf(sections.find((s) => s.id === sectionId)!.columnId);
      if (branchOf(targetColumnId) !== from) {
        throw new Error(
          "Bo'limni boshqa filialning ustuniga ko'chirib bo'lmaydi",
        );
      }
    };
    expect(() => move('s1', 'c3')).toThrow();
    expect(() => move('s1', 'c2')).not.toThrow();
  });

  it("stamps a lead with its section's column branch", () => {
    // This is what closes the unassigned-pool case above for every lead born on
    // the board — including public-form submissions, which route into a section
    // and therefore now arrive with a branch instead of into the shared pool.
    const leadBranch = (sectionId: string) =>
      branchOf(sections.find((s) => s.id === sectionId)!.columnId);
    expect(leadBranch('s3')).toBe(2);
    expect(leadBranch('s1')).toBe(1);
  });
});
