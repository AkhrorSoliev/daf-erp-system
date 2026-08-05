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
      expect(JSON.stringify(leadAttributionWhere(NAMANGAN))).not.toContain('null');
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
          (l) => l.branchId == null || (l.branchId != null && ids.includes(l.branchId)),
        ).length;
      // 2 + 2 = 4 for a company of 3 — this is why counts use a different rule.
      expect(visible(FARGONA) + visible(NAMANGAN)).toBeGreaterThan(leads.length);
    });
  });
});
