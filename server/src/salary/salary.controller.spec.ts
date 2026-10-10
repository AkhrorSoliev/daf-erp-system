import 'reflect-metadata';
import { SalaryController } from './salary.controller';
import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { PayPaymentDto } from './dto/pay-payment.dto';

const CEO_ONLY = ['CEO'];
const CEO_AND_BRANCH_DIRECTOR = ['Branch Director', 'CEO'];

describe('SalaryController — route access', () => {
  // Pins every salary route's marker and the roles it admits by default, so a
  // refactor that accidentally widens the gate is caught by tests, not by an
  // audit.
  function expectCan(method: string, key: string) {
    expect(routeAccess(SalaryController, method)).toEqual({
      kind: 'can',
      keys: [key],
    });
  }

  describe('CEO-only writes (Faza 2 narrowing)', () => {
    // A company-wide bulk rate moves every branch at once — CEO only. A
    // director's PATCH could mark a closed config active with no open version,
    // or edit a rate the director could never have created — so the edit path
    // stays CEO-only too. Only `POST /salary/config` (a new version) is shared
    // with the director (ADR-0034).
    it.each(['applyGlobalConfig', 'updateConfig'] as const)(
      '%s is gated by the rate-edit capability, CEO by default',
      (method) => {
        expectCan(method, 'salary.rate-edit');
        expect(defaultRolesOf(SalaryController, method)).toEqual(CEO_ONLY);
      },
    );

    // Cron-internal calculation, its approval and the period settings; a
    // month-wide settle is irreversible and spans every branch's payroll, so
    // it sits here rather than with the per-payment payouts.
    it.each([
      'calculateSalaries',
      'previewPeriod',
      'approvePayment',
      'previewSettleMonth',
      'settleMonth',
      'createPeriodSetting',
    ] as const)(
      '%s is gated by the salary close capability, CEO by default',
      (method) => {
        expectCan(method, 'salary.close');
        expect(defaultRolesOf(SalaryController, method)).toEqual(CEO_ONLY);
      },
    );
  });

  describe('Payouts', () => {
    it.each(['payPayment', 'batchPay'] as const)(
      '%s is gated by the pay capability, CEO and Branch Director by default',
      (method) => {
        expectCan(method, 'salary.pay');
        expect(defaultRolesOf(SalaryController, method)).toEqual(
          CEO_AND_BRANCH_DIRECTOR,
        );
      },
    );
  });

  describe('Teacher rate writes — CEO + own-branch Branch Director (ADR-0034)', () => {
    // The capability only admits the director; WHICH teacher they may touch is
    // decided in `shared/teacher-rate-permission.ts` (own branch, holds
    // Teacher, not CEO/Branch Director, not self, active, not FIXED_MONTHLY).
    it('createConfig is gated by the rate capability, CEO and Branch Director by default', () => {
      expectCan('createConfig', 'salary.rate');
      expect(defaultRolesOf(SalaryController, 'createConfig')).toEqual(
        CEO_AND_BRANCH_DIRECTOR,
      );
    });

    // A preview reveals what the save would do to a teacher's pay (ADR-0050),
    // so it admits exactly who may save — never wider.
    it('previewConfig carries the same marker and admits the same roles as createConfig', () => {
      expect(routeAccess(SalaryController, 'previewConfig')).toEqual(
        routeAccess(SalaryController, 'createConfig'),
      );
      expect(defaultRolesOf(SalaryController, 'previewConfig')).toEqual(
        defaultRolesOf(SalaryController, 'createConfig'),
      );
    });
  });

  describe('«Ish haqi» page reads — CEO and Branch Director by default', () => {
    // An Administrator does not see salaries (docs/role-access.md, «View
    // salary»). The «Ish haqi» page has been hidden from them since April,
    // while the server left these endpoints open to them: an administrator
    // typing the address by hand could read every teacher's pay. Closed on
    // 30.09.2026. «Markaz qoplagani» (getCenterTopUpStudents) is a tab of the
    // same page (ADR-0072), and getStaffConfig carries the administrative
    // staff's own pay, so both follow the page.
    const pageReads = [
      'getConfig',
      'getConfigsForUsers',
      'getConfigHistory',
      'listPeriodSettings',
      'getAccruals',
      'findPayments',
      'getMatrix',
      'getOverview',
      'getStaffConfig',
      'getMonthly',
      'getCenterTopUpStudents',
      // Money for ONE named teacher — the profile salary tab and card.
      'getMonthlyForUser',
      // The row drawer: the same person's month, and its live accruals.
      'getMonthlyDetail',
      'getMonthlyLessons',
      'getAdvanceCalendar',
      'getPaymentBreakdown',
    ] as const;

    it.each(pageReads)(
      '%s is gated by the salary view capability',
      (method) => {
        expectCan(method, 'salary.view');
      },
    );

    it.each(pageReads)(
      '%s admits the CEO and the Branch Director by default, not the Administrator or the Cashier',
      (method) => {
        expect(defaultRolesOf(SalaryController, method)).toEqual(
          CEO_AND_BRANCH_DIRECTOR,
        );
      },
    );

    // Two lists sit side by side in one dialog (⚙ Sozlamalar → «Xodimlar
    // stavkalari»): whoever sees one must see the other, or the dialog opens
    // half 403.
    it('getStaffConfig admits exactly the roles of the teacher rate list beside it', () => {
      expect(defaultRolesOf(SalaryController, 'getStaffConfig')).toEqual(
        defaultRolesOf(SalaryController, 'getOverview'),
      );
    });
  });

  describe("Taymlayn — the teacher profile's tab, the Administrator sees it too", () => {
    it('getTimeline is gated by the teacher view capability, Administrator included by default', () => {
      expectCan('getTimeline', 'teachers.view');
      expect(defaultRolesOf(SalaryController, 'getTimeline')).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    });
  });

  describe('Self-service (the caller reads their own pay via @CurrentUser)', () => {
    // The me/* handlers pass the caller's own id to the service, so any staff
    // member may call them — a Cashier on payroll included (Appendix C of the
    // permissions plan).
    const selfEndpoints = [
      'getMySummary',
      'getMyAccruals',
      'getMyCurrentCycleBreakdown',
      'getMyPaymentBreakdown',
      // «Mening oyligim» — the same monthly row /payments/salary shows.
      'getMyMonthly',
    ] as const;

    it.each(selfEndpoints)('%s is open to any staff account', (method) => {
      expect(routeAccess(SalaryController, method)).toEqual({
        kind: 'anyStaff',
      });
    });

    it.each(selfEndpoints)(
      '%s admits all five staff roles, the Cashier included',
      (method) => {
        expect(defaultRolesOf(SalaryController, method)).toEqual([
          'Administrator',
          'Branch Director',
          'CEO',
          'Cashier',
          'Teacher',
        ]);
      },
    );
  });
});

describe('SalaryController — the row drawer routes', () => {
  const period = {
    periodStart: new Date('2026-08-31T19:00:00Z'),
    periodEnd: new Date('2026-09-30T18:59:59.999Z'),
    periodStartDate: new Date('2026-09-01T00:00:00Z'),
    periodEndDateExclusive: new Date('2026-10-01T00:00:00Z'),
    cycleStartDay: 1,
  };
  const detailService = {
    getDetail: jest.fn(),
    getPeriod: jest.fn(),
  };
  const breakdownService = { getPeriodBreakdown: jest.fn() };
  const controller = new SalaryController(
    {} as never,
    {} as never,
    breakdownService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    detailService as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('detail follows the header: only the month and the single scoped branch go down', async () => {
    detailService.getDetail.mockResolvedValue({ kind: 'teacher' });

    await controller.getMonthlyDetail(
      10001,
      { month: '2026-09', search: 'ignored' },
      10009,
      1,
      [3],
    );

    expect(detailService.getDetail).toHaveBeenCalledWith(
      10001,
      { month: '2026-09', branchId: 3 },
      1,
      10009,
    );
  });

  it("lessons reads the month's period from the detail service, then its breakdown", async () => {
    detailService.getPeriod.mockResolvedValue(period);
    breakdownService.getPeriodBreakdown.mockResolvedValue({ lines: [] });

    await expect(
      controller.getMonthlyLessons(10001, { month: '2026-09' }, 10009, 1, [3]),
    ).resolves.toEqual({ lines: [] });

    expect(detailService.getPeriod).toHaveBeenCalledWith(
      10001,
      { month: '2026-09', branchId: 3 },
      1,
      10009,
    );
    expect(breakdownService.getPeriodBreakdown).toHaveBeenCalledWith(
      10001,
      1,
      period,
    );
  });

  it('lessons for a person outside the scope is a 404 and reads no accruals', async () => {
    detailService.getPeriod.mockRejectedValue(
      new NotFoundException('Bu oyda xodim topilmadi'),
    );

    await expect(
      controller.getMonthlyLessons(10001, { month: '2026-09' }, 10009, 1, [3]),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(breakdownService.getPeriodBreakdown).not.toHaveBeenCalled();
  });
});

describe('SalaryController — «Berildi» (pay route)', () => {
  const salaryService = { payPayment: jest.fn() };
  const controller = new SalaryController(
    salaryService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  // The same pipe main.ts installs globally.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const parse = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: PayPaymentDto });
  const ACC = '11111111-1111-4111-8111-111111111111';
  const valid = {
    paidAt: '2026-10-05',
    cashSlices: [{ cashAccountId: ACC, amount: 7_840_000 }],
  };

  beforeEach(() => jest.resetAllMocks());

  it('keeps the salary.pay marker', () => {
    expect(routeAccess(SalaryController, 'payPayment')).toEqual({
      kind: 'can',
      keys: ['salary.pay'],
    });
  });

  it('hands the body, the caller and the company to the service', async () => {
    const dto = await parse({ ...valid, note: 'avgust' });
    salaryService.payPayment.mockResolvedValue({ notified: true });

    await expect(
      controller.payPayment('sp-1', dto as PayPaymentDto, 10012, 1),
    ).resolves.toEqual({ notified: true });

    expect(salaryService.payPayment).toHaveBeenCalledWith(
      'sp-1',
      dto,
      10012,
      1,
    );
  });

  it('accepts the 0 so’m body: a day and no slices', async () => {
    await expect(
      parse({ paidAt: '2026-10-05', cashSlices: [] }),
    ).resolves.toMatchObject({ cashSlices: [] });
  });

  // The old client's «To'lash» sends no body at all and must get a 400.
  it.each([undefined, {}])('a body-less call (%j) is a 400', async (body) => {
    await expect(parse(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['a day that is not YYYY-MM-DD', { ...valid, paidAt: '05.10.2026' }],
    ['no slices field', { paidAt: '2026-10-05' }],
    [
      'a slice of 0',
      { ...valid, cashSlices: [{ cashAccountId: ACC, amount: 0 }] },
    ],
    [
      'a fractional slice',
      { ...valid, cashSlices: [{ cashAccountId: ACC, amount: 10.5 }] },
    ],
    [
      'an account id that is not a uuid',
      { ...valid, cashSlices: [{ cashAccountId: 'acc-1', amount: 1 }] },
    ],
    [
      'more than five slices',
      {
        ...valid,
        cashSlices: Array.from({ length: 6 }, () => ({
          cashAccountId: ACC,
          amount: 1,
        })),
      },
    ],
    ['a note over 300 characters', { ...valid, note: 'x'.repeat(301) }],
    ['a field nobody asked for', { ...valid, status: 'PAID' }],
  ])('refuses %s', async (_label, body) => {
    await expect(parse(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
