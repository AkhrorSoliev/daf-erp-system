import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { SalaryController } from './salary.controller';

describe('SalaryController @Roles metadata', () => {
  // The whole controller is gated by RolesGuard. We assert the per-method
  // metadata here so a refactor that accidentally widens the gate is
  // caught by tests, not by an audit.
  const reflector = new Reflector();

  function rolesFor(method: keyof SalaryController): string[] {
    const handler = SalaryController.prototype[method] as any;
    return reflector.get<string[]>(ROLES_KEY, handler) ?? [];
  }

  describe('CEO-only writes (Faza 2 narrowing)', () => {
    it.each(['createConfig', 'applyGlobalConfig', 'updateConfig'] as const)(
      '%s requires CEO',
      (method) => {
        expect(rolesFor(method)).toEqual(['CEO']);
      },
    );

    it('createPeriodSetting requires CEO', () => {
      expect(rolesFor('createPeriodSetting')).toEqual(['CEO']);
    });

    it.each(['calculateSalaries', 'previewPeriod', 'approvePayment'] as const)(
      '%s requires CEO',
      (method) => {
        expect(rolesFor(method)).toEqual(['CEO']);
      },
    );
  });

  describe('CEO + Branch Director allowed (payouts)', () => {
    it.each(['payPayment', 'batchPay'] as const)(
      '%s allows CEO and Branch Director',
      (method) => {
        expect(rolesFor(method)).toEqual(['CEO', 'Branch Director']);
      },
    );
  });

  describe('Read-only (CEO + BD + Administrator)', () => {
    const readers = [
      'getConfig',
      'getConfigHistory',
      'getTimeline',
      'listPeriodSettings',
      'getAccruals',
      'findPayments',
      'getMatrix',
      'getOverview',
      'getMonthly',
      'getAdvances',
      'getPaymentBreakdown',
    ] as const;
    it.each(readers)('%s allows CEO/BD/Administrator', (method) => {
      expect(rolesFor(method)).toEqual([
        'CEO',
        'Branch Director',
        'Administrator',
      ]);
    });
  });

  describe('Self-service (any authenticated user via @CurrentUser)', () => {
    // The me/* endpoints rely on the controller-level @Roles which include
    // 'Teacher'. They have no method-level @Roles override.
    const selfEndpoints = [
      'getMySummary',
      'getMyAccruals',
      'getMyCurrentCycleBreakdown',
      'getMyPaymentBreakdown',
      // "Mening oyligim" — the same monthly row /payments/salary shows.
      'getMyMonthly',
    ] as const;
    it.each(selfEndpoints)('%s has no method-level role override', (method) => {
      expect(rolesFor(method)).toEqual([]);
    });
  });

  describe('Per-user monthly row (profile tab + profile card)', () => {
    // Money for ONE named teacher — same gate as the profile salary tab it
    // backs (`/teachers/:id/salary-summary`), i.e. Administrator is excluded.
    it('getMonthlyForUser allows CEO and Branch Director only', () => {
      expect(rolesFor('getMonthlyForUser')).toEqual(['CEO', 'Branch Director']);
    });
  });
});
