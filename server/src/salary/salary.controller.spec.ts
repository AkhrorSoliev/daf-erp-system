import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SalaryController } from './salary.controller';

describe('SalaryController @Roles metadata', () => {
  // The whole controller is gated by RolesGuard. We assert the per-method
  // metadata here so a refactor that accidentally widens the gate is
  // caught by tests, not by an audit.
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function rolesFor(method: keyof SalaryController): string[] {
    const handler = SalaryController.prototype[method] as any;
    return reflector.get<string[]>(ROLES_KEY, handler) ?? [];
  }

  function ctx(method: keyof SalaryController, roles: string[]) {
    return {
      getHandler: () => SalaryController.prototype[method],
      getClass: () => SalaryController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as any;
  }

  describe('CEO-only writes (Faza 2 narrowing)', () => {
    // A company-wide bulk rate moves every branch at once — CEO only.
    it('applyGlobalConfig requires CEO', () => {
      expect(rolesFor('applyGlobalConfig')).toEqual(['CEO']);
    });

    it('createPeriodSetting requires CEO', () => {
      expect(rolesFor('createPeriodSetting')).toEqual(['CEO']);
    });

    it.each(['calculateSalaries', 'previewPeriod', 'approvePayment'] as const)(
      '%s requires CEO',
      (method) => {
        expect(rolesFor(method)).toEqual(['CEO']);
      },
    );

    // A director's PATCH could mark a closed config active with no open
    // version, or edit a rate the director could never have created — so the
    // edit path stays CEO-only. Only `POST /salary/config` (a new version) is
    // shared with the director (ADR-0034).
    it('updateConfig requires CEO', () => {
      expect(rolesFor('updateConfig')).toEqual(['CEO']);
    });

    // A month-wide settle is irreversible and spans every branch's payroll, so
    // it sits with the CEO writes rather than with the per-payment payouts a
    // Branch Director may run.
    it.each(['previewSettleMonth', 'settleMonth'] as const)(
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

  describe('Teacher rate writes — CEO + own-branch Branch Director (ADR-0034)', () => {
    // The role gate only admits the director; WHICH teacher they may touch is
    // decided in `shared/teacher-rate-permission.ts` (own branch, holds
    // Teacher, not CEO/Branch Director, not self, active, not FIXED_MONTHLY).
    it('createConfig allows CEO and Branch Director', () => {
      expect(rolesFor('createConfig')).toEqual(['CEO', 'Branch Director']);
    });

    // A preview reveals what the save would do to a teacher's pay (ADR-0050),
    // so it admits exactly who may save — never wider.
    it('previewConfig admits exactly the roles createConfig does', () => {
      expect(rolesFor('previewConfig')).toEqual(rolesFor('createConfig'));
    });
  });

  describe("«Ish haqi» sahifasining o'qishlari — faqat CEO + Branch Director", () => {
    // Administrator oylikni ko'rmaydi (docs/role-access.md, «View salary»).
    // «Ish haqi» sahifasi undan aprel oyidan beri yashirin, server esa shu
    // endpointlarni unga ochiq qoldirgan edi: manzilni qo'lda yozgan admin
    // har bir ustozning oyligini o'qiy olardi. 30.09.2026 da yopildi.
    const pageReads = [
      'getConfig',
      'getConfigsForUsers',
      'getConfigHistory',
      'listPeriodSettings',
      'getAccruals',
      'findPayments',
      'getMatrix',
      'getOverview',
      'getMonthly',
      'getAdvances',
      'getAdvanceCalendar',
      'getPaymentBreakdown',
    ] as const;
    it.each(pageReads)('%s allows CEO and Branch Director only', (method) => {
      expect(rolesFor(method)).toEqual(['CEO', 'Branch Director']);
    });

    it('RolesGuard refuses an Administrator on /salary/monthly', () => {
      expect(() =>
        guard.canActivate(ctx('getMonthly', ['Administrator'])),
      ).toThrow(ForbiddenException);
    });
  });

  describe("Taymlayn — o'qituvchi profilining tabi, admin ham ko'radi", () => {
    it('getTimeline allows CEO/BD/Administrator', () => {
      expect(rolesFor('getTimeline')).toEqual([
        'CEO',
        'Branch Director',
        'Administrator',
      ]);
    });
  });

  describe('«Markaz qoplagani» — the salary page tab, CEO and Branch Director only (ADR-0072)', () => {
    it('getCenterTopUpStudents allows CEO and Branch Director only', () => {
      expect(rolesFor('getCenterTopUpStudents')).toEqual([
        'CEO',
        'Branch Director',
      ]);
    });

    it('RolesGuard keeps an Administrator and a Cashier out', () => {
      for (const role of ['Administrator', 'Cashier']) {
        expect(() =>
          guard.canActivate(ctx('getCenterTopUpStudents', [role])),
        ).toThrow(ForbiddenException);
      }
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

  describe('Staff rate list (⚙ Sozlamalar → Xodimlar stavkalari)', () => {
    // This list carries the pay of the administrative staff themselves —
    // including whoever is looking at it — so it follows the "Salary config"
    // row of docs/role-access.md. Administrator is deliberately excluded.
    it('getStaffConfig allows CEO and Branch Director only', () => {
      expect(rolesFor('getStaffConfig')).toEqual(['CEO', 'Branch Director']);
    });

    // Ikki ro'yxat bitta oynada yonma-yon turadi: birini ko'rgan boshqasini
    // ham ko'rishi kerak, aks holda oyna yarmi 403 bilan ochiladi.
    it('admits exactly the roles of the teacher rate list beside it', () => {
      expect(rolesFor('getStaffConfig')).toEqual(rolesFor('getOverview'));
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
