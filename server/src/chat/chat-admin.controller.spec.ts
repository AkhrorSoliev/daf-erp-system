import { routeAccess } from '../common/permissions/testing';
import { ChatAdminController } from './chat-admin.controller';

describe('ChatAdminController access', () => {
  it.each([
    'list',
    'get',
    'resolve',
    'banStudent',
    'unbanStudent',
    'getSettings',
    'updateSettings',
    'banned',
  ])('%s is CEO-only by identity', (name) => {
    expect(routeAccess(ChatAdminController, name)).toEqual({ kind: 'ceo' });
  });
});
