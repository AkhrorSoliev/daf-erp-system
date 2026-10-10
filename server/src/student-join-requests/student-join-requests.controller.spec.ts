import { StudentJoinRequestsController } from './student-join-requests.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('StudentJoinRequestsController — route access', () => {
  it.each(['byTask', 'approve', 'reject'] as const)(
    "%s is gated by «Guruhga qo'shish», the admin door's own capability",
    (name) => {
      expect(routeAccess(StudentJoinRequestsController, name)).toEqual({
        kind: 'can',
        keys: ['students.enroll'],
      });
      expect(defaultRolesOf(StudentJoinRequestsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('passes the caller with its database roles', async () => {
    const decisions = {
      approve: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
      reject: jest.fn().mockResolvedValue({ status: 'REJECTED' }),
      getByTask: jest.fn().mockResolvedValue({}),
    };
    const c = new StudentJoinRequestsController(decisions as never);

    await c.approve('r1', { groupId: 'g2' }, 10002, 1001, ['Administrator']);
    await c.reject('r1', { reason: 'x' }, 10002, 1001, ['Administrator']);
    await c.byTask('t1', 10002, 1001, ['Administrator']);

    const caller = { id: 10002, companyId: 1001, roles: ['Administrator'] };
    expect(decisions.approve).toHaveBeenCalledWith('r1', 'g2', caller);
    expect(decisions.reject).toHaveBeenCalledWith('r1', 'x', caller);
    expect(decisions.getByTask).toHaveBeenCalledWith('t1', caller);
  });
});
