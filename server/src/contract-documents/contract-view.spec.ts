import {
  contractStatus,
  toContractView,
  type ContractWithView,
} from './contract-view';

const row = (over: Partial<ContractWithView> = {}): ContractWithView =>
  ({
    id: 'doc-1',
    companyId: 1,
    number: 'DAF-2026-00001',
    studentId: 10001,
    branchId: 1,
    templateVersion: 1,
    contractDate: new Date('2026-10-10T00:00:00Z'),
    fields: { courses: [] },
    createdById: 7,
    createdAt: new Date('2026-10-10T06:00:00Z'),
    updatedAt: new Date('2026-10-10T06:00:00Z'),
    signedAt: null,
    signedById: null,
    signMethod: null,
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    createdBy: { firstName: 'Ali', lastName: 'Valiyev' },
    signedBy: null,
    cancelledBy: null,
    enrollments: [{ id: 'e-1', status: 'ACTIVE', group: { name: '#032' } }],
    ...over,
  }) as ContractWithView;

describe('contract view', () => {
  it('derives the status from the two stamps', () => {
    expect(contractStatus({ signedAt: null, cancelledAt: null })).toBe(
      'UNSIGNED',
    );
    expect(contractStatus({ signedAt: new Date(), cancelledAt: null })).toBe(
      'SIGNED',
    );
    expect(
      contractStatus({ signedAt: new Date(), cancelledAt: new Date() }),
    ).toBe('CANCELLED');
  });

  it('maps the row for the profile tab', () => {
    expect(toContractView(row())).toMatchObject({
      id: 'doc-1',
      number: 'DAF-2026-00001',
      contractDate: '2026-10-10',
      status: 'UNSIGNED',
      createdBy: 'Valiyev Ali',
      signedBy: null,
      links: [{ enrollmentId: 'e-1', status: 'ACTIVE', groupName: '#032' }],
    });
  });
});
