import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { MockExamsController } from './mock-exams.controller';

const ADMIN_ROLES = ['Administrator', 'Branch Director', 'CEO'];

describe('MockExamsController — route access', () => {
  const READS = [
    'list',
    'findOne',
    'stats',
    'board',
    'revenueSummary',
  ] as const;
  const WRITES = [
    'create',
    'update',
    'changeStatus',
    'remove',
    'rebroadcastResults',
    'regeneratePdf',
  ] as const;

  it.each(READS)('%s is gated by the mock exam view capability', (name) => {
    expect(routeAccess(MockExamsController, name)).toEqual({
      kind: 'can',
      keys: ['mock.view'],
    });
  });

  it.each(WRITES)('%s is gated by the mock exam manage capability', (name) => {
    expect(routeAccess(MockExamsController, name)).toEqual({
      kind: 'can',
      keys: ['mock.manage'],
    });
  });

  it.each([...READS, ...WRITES])(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(MockExamsController, name)).toEqual(ADMIN_ROLES);
    },
  );
});
