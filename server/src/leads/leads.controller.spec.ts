import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { LeadsController } from './leads.controller';

const ADMIN_ROLES = ['Administrator', 'Branch Director', 'CEO'];

describe('LeadsController — route access', () => {
  // Looking at the board, the list, the archive and a single lead.
  const READS = [
    'findAll',
    'findOne',
    'getHoverSummary',
    'getArchive',
    'getBoard',
    'getStats',
    'getSectionLeads',
  ] as const;
  // Creating, editing, moving, converting, archiving and restoring leads.
  const WRITES = [
    'create',
    'update',
    'move',
    'reorder',
    'convert',
    'restore',
    'remove',
  ] as const;

  it.each(READS)('%s is gated by the leads view capability', (name) => {
    expect(routeAccess(LeadsController, name)).toEqual({
      kind: 'can',
      keys: ['leads.view'],
    });
  });

  it.each(WRITES)('%s is gated by the leads manage capability', (name) => {
    expect(routeAccess(LeadsController, name)).toEqual({
      kind: 'can',
      keys: ['leads.manage'],
    });
  });

  it("the student profile's lead history is open to the leads view and the student details capabilities", () => {
    expect(routeAccess(LeadsController, 'findByStudentId')).toEqual({
      kind: 'can',
      keys: ['leads.view', 'students.details'],
    });
  });

  it('the called marker is open to leads manage and the forms capability, which toggles it from form answers', () => {
    expect(routeAccess(LeadsController, 'markCalled')).toEqual({
      kind: 'can',
      keys: ['leads.manage', 'leads.forms'],
    });
  });

  it.each([...READS, ...WRITES, 'findByStudentId', 'markCalled'])(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(LeadsController, name)).toEqual(ADMIN_ROLES);
    },
  );
});
