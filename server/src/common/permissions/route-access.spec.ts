import { accessSummary } from './route-access';

describe('accessSummary', () => {
  it('writes a public route and an any-account route the snapshot way', () => {
    expect(accessSummary({ kind: 'public' })).toBe('PUBLIC');
    expect(accessSummary({ kind: 'anyUser' })).toBe('ANY');
  });

  it('writes an unmarked route as NONE, which no snapshot row equals', () => {
    // PermissionGuard refuses a route with no marker; summarising it as 'ANY'
    // would let the equivalence row of a forgotten route pass.
    expect(accessSummary({ kind: 'none' })).toBe('NONE');
  });

  it('lists the student and the five staff roles', () => {
    expect(accessSummary({ kind: 'student' })).toEqual(['Student']);
    expect(accessSummary({ kind: 'anyStaff' })).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
      'Cashier',
      'Teacher',
    ]);
  });

  it('turns capabilities into the CEO plus the union of their defaults', () => {
    expect(accessSummary({ kind: 'can', keys: ['expenses.view'] })).toEqual([
      'Branch Director',
      'CEO',
    ]);
    expect(
      accessSummary({ kind: 'can', keys: ['students.list', 'groups.view'] }),
    ).toEqual(['Administrator', 'Branch Director', 'CEO', 'Teacher']);
    expect(accessSummary({ kind: 'can', keys: ['money.undo'] })).toEqual([
      'CEO',
    ]);
  });

  it('refuses a capability the catalog does not know', () => {
    expect(() => accessSummary({ kind: 'can', keys: ['no.such'] })).toThrow(
      'Unknown capability "no.such"',
    );
  });
});
