import { LeadStatus } from '@prisma/client';
import { RELEASED_OWNER, restoreRelease } from './restore-release';

const LEAD = { id: 'L1', firstName: 'Ali', lastName: 'Valiyev', ownerId: 11 };
const CTX = { branchId: 2, companyId: 1001, actorId: 7 };

describe('restoreRelease', () => {
  it('releases the owner of a lead restored into the pool', () => {
    expect(restoreRelease(LEAD, LeadStatus.NEW, CTX)).toEqual({
      leadId: 'L1',
      leadName: 'Ali Valiyev',
      branchId: 2,
      kind: 'RELEASE',
      fromUserId: 11,
      toUserId: null,
      actorId: 7,
      reason: 'Arxivdan tiklandi',
      companyId: 1001,
    });
  });

  it('keeps the owner of a converted lead: the KPI is credited to it', () => {
    expect(restoreRelease(LEAD, LeadStatus.CONVERTED, CTX)).toBeNull();
  });

  it('has nothing to release on a lead with no owner', () => {
    expect(
      restoreRelease({ ...LEAD, ownerId: null }, LeadStatus.NEW, CTX),
    ).toBeNull();
  });

  it('clears all three owner fields', () => {
    expect(RELEASED_OWNER).toEqual({
      ownerId: null,
      ownedAt: null,
      ownerActedAt: null,
    });
  });
});
