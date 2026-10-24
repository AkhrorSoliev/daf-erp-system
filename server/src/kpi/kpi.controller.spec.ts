import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { KpiController } from './kpi.controller';

describe('KpiController', () => {
  it.each(['overview', 'user', 'getSettings'])(
    '%s is gated by kpi.view: the CEO and the Branch Director',
    (method) => {
      expect(routeAccess(KpiController, method)).toEqual({
        kind: 'can',
        keys: ['kpi.view'],
      });
      expect(defaultRolesOf(KpiController, method)).toEqual([
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('only the CEO changes the prices and the switch', () => {
    expect(routeAccess(KpiController, 'setSettings')).toEqual({ kind: 'ceo' });
  });

  it('passes the company, the header scope and the query', async () => {
    const read = {
      overview: jest.fn().mockResolvedValue({}),
      user: jest.fn().mockResolvedValue({}),
    };
    const kpiSettings = {
      read: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };
    const controller = new KpiController(read as never, kpiSettings as never);

    await controller.overview(
      { month: '2026-10', compare: '2026-09' },
      1001,
      [2],
    );
    expect(read.overview).toHaveBeenCalledWith(1001, [2], {
      month: '2026-10',
      compare: '2026-09',
    });

    await controller.user(11, { month: '2026-10' }, 1001, null);
    expect(read.user).toHaveBeenCalledWith(1001, null, 11, {
      month: '2026-10',
    });

    await controller.getSettings(1001);
    expect(kpiSettings.read).toHaveBeenCalledWith(1001);

    await controller.setSettings({ enabled: false }, 1001, 7);
    expect(kpiSettings.update).toHaveBeenCalledWith(
      1001,
      { enabled: false },
      7,
    );
  });
});
