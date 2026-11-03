import {
  buildTeacherRosterWhere,
  GLOBAL_FIXED_MONTHLY_CONFIG,
} from './teacher-roster-where';

describe('buildTeacherRosterWhere', () => {
  const scope = {
    companyId: 1001,
    blocked: false,
    userId: undefined,
    branchId: 1,
    search: undefined,
    searchId: null,
  };

  // The staff table lists everyone on a company-wide fixed monthly salary; the
  // teacher table must leave them out, or a person is counted twice — or, as
  // before this rule, counted in neither total.
  it('leaves out everyone on a company-wide fixed monthly salary', () => {
    expect(buildTeacherRosterWhere(scope)).toMatchObject({
      roles: { some: { role: { name: 'Teacher' } } },
      salaryConfigs: { none: { groupId: null, salaryType: 'FIXED_MONTHLY' } },
    });
  });

  it('shares the clause with the staff table', () => {
    expect(buildTeacherRosterWhere(scope).salaryConfigs).toEqual({
      none: GLOBAL_FIXED_MONTHLY_CONFIG,
    });
  });
});
