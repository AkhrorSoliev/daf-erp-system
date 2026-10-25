import { EntityHistoryController } from './entity-history.controller';
import {
  defaultRolesOf,
  fakePermissions,
  routeAccess,
} from '../permissions/testing';
import type { EntityHistoryService } from './entity-history.service';

describe('EntityHistoryController — route access', () => {
  it('is gated by the capability of every page that shows a history tab', () => {
    expect(routeAccess(EntityHistoryController, 'getHistory')).toEqual({
      kind: 'can',
      keys: [
        'students.details',
        'groups.manage',
        'teachers.view',
        'employees.view',
        'settings.reference',
        'settings.branches',
        'leads.view',
      ],
    });
  });

  it('admits the CEO, the Branch Director and the Administrator by default, nobody else', () => {
    expect(defaultRolesOf(EntityHistoryController, 'getHistory')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });
});

describe('EntityHistoryController — pay data', () => {
  const read = async (roleId: number) => {
    const getHistory = jest.fn().mockResolvedValue({ data: [] });
    const controller = new EntityHistoryController(
      { getHistory } as unknown as EntityHistoryService,
      fakePermissions([roleId]),
    );
    await controller.getHistory('User', '10001', {}, 1, 7, ['x']);
    return getHistory.mock.calls[0][3];
  };

  it("tells the service whether the reader may see an employee's pay", async () => {
    expect(await read(1)).toEqual(
      expect.objectContaining({ canViewSalary: true }),
    );
    expect(await read(3)).toEqual(
      expect.objectContaining({ canViewSalary: false }),
    );
  });
});
