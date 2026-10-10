import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { MockExamSubjectsController } from './mock-exam-subjects.controller';

describe('MockExamSubjectsController — route access', () => {
  const WRITES = ['create', 'reorder', 'update', 'remove'] as const;

  it("an exam's subject list is gated by the mock exam view capability", () => {
    expect(routeAccess(MockExamSubjectsController, 'list')).toEqual({
      kind: 'can',
      keys: ['mock.view'],
    });
  });

  it.each(WRITES)('%s is gated by the mock exam manage capability', (name) => {
    expect(routeAccess(MockExamSubjectsController, name)).toEqual({
      kind: 'can',
      keys: ['mock.manage'],
    });
  });

  it.each(['list', ...WRITES])(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(MockExamSubjectsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
