import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { GatewaysController } from './gateways.controller';

describe('GatewaysController — route access', () => {
  it('listEvents is gated by the gateway log capability and admits the CEO by default, nobody else', () => {
    expect(routeAccess(GatewaysController, 'listEvents')).toEqual({
      kind: 'can',
      keys: ['payments.gateway-log'],
    });
    expect(defaultRolesOf(GatewaysController, 'listEvents')).toEqual(['CEO']);
  });

  // The providers call in without a token; the signature is checked inside.
  it.each(['paymeWebhook', 'clickWebhook', 'uzumWebhook'])(
    '%s stays public',
    (name) => {
      expect(routeAccess(GatewaysController, name)).toEqual({
        kind: 'public',
      });
    },
  );
});
