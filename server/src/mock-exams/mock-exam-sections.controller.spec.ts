import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { MockExamSectionsController } from './mock-exam-sections.controller';

describe('MockExamSectionsController — route access', () => {
  const WRITES = ['create', 'reorder', 'update', 'remove'] as const;

  it('the section list is gated by the mock exam view capability', () => {
    expect(routeAccess(MockExamSectionsController, 'list')).toEqual({
      kind: 'can',
      keys: ['mock.view'],
    });
  });

  it.each(WRITES)('%s is gated by the mock exam manage capability', (name) => {
    expect(routeAccess(MockExamSectionsController, name)).toEqual({
      kind: 'can',
      keys: ['mock.manage'],
    });
  });

  it.each(['list', ...WRITES])(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(MockExamSectionsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
