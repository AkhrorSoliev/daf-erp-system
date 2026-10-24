import { routeAccess } from '../common/permissions/testing';
import { TelegramReportController } from './telegram-report.controller';

describe('TelegramReportController access', () => {
  it.each([
    'list',
    'candidates',
    'create',
    'update',
    'remove',
    'test',
    'check',
    'preview',
  ])('%s is CEO-only by identity', (name) => {
    expect(routeAccess(TelegramReportController, name)).toEqual({
      kind: 'ceo',
    });
  });
});
