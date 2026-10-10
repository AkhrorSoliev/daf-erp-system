import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { MockExamResultsController } from './mock-exam-results.controller';

describe('MockExamResultsController — route access', () => {
  it('the results matrix is gated by the mock exam view capability', () => {
    expect(routeAccess(MockExamResultsController, 'matrix')).toEqual({
      kind: 'can',
      keys: ['mock.view'],
    });
  });

  it.each(['bulkSave', 'recalculateRanks'])(
    '%s is gated by the mock exam manage capability',
    (name) => {
      expect(routeAccess(MockExamResultsController, name)).toEqual({
        kind: 'can',
        keys: ['mock.manage'],
      });
    },
  );

  it.each(['matrix', 'bulkSave', 'recalculateRanks'])(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(MockExamResultsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
