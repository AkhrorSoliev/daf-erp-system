import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { LeadOwnershipController } from './lead-ownership.controller';

describe('LeadOwnershipController — route access', () => {
  it.each([
    ['claim', ['leads.claim'], ['Administrator', 'CEO']],
    [
      'release',
      ['leads.claim', 'leads.assign'],
      ['Administrator', 'Branch Director', 'CEO'],
    ],
    ['assign', ['leads.assign'], ['Branch Director', 'CEO']],
    ['assignable', ['leads.assign'], ['Branch Director', 'CEO']],
    ['summary', ['leads.view'], ['Administrator', 'Branch Director', 'CEO']],
    [
      'getSettings',
      ['leads.view'],
      ['Administrator', 'Branch Director', 'CEO'],
    ],
  ] as const)('%s is gated by %j', (name, keys, roles) => {
    expect(routeAccess(LeadOwnershipController, name)).toEqual({
      kind: 'can',
      keys: [...keys],
    });
    expect(defaultRolesOf(LeadOwnershipController, name)).toEqual([...roles]);
  });

  it('only the CEO changes the limits', () => {
    expect(routeAccess(LeadOwnershipController, 'setSettings')).toEqual({
      kind: 'ceo',
    });
  });
});
