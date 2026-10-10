import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

const FOUR_ROLES = ['Administrator', 'Branch Director', 'CEO', 'Cashier'];

describe('PaymentsController — route access', () => {
  // Recording a payment, and the live projection the record dialog shows.
  const CREATES = ['create', 'attachExternal', 'preview'] as const;
  // The payments list, one payment, and the students nobody has paid yet.
  const VIEWS = ['findAll', 'findOne', 'getPending'] as const;
  // The debt lists: debtors, a group's debtors and the frozen students' money.
  const DEBTS = [
    'getDebtors',
    'getDebtorsForGroup',
    'getFrozenBalances',
  ] as const;

  it.each(CREATES)(
    '%s is gated by the payment recording capability',
    (name) => {
      expect(routeAccess(PaymentsController, name)).toEqual({
        kind: 'can',
        keys: ['payments.create'],
      });
    },
  );

  it.each(VIEWS)('%s is gated by the payments view capability', (name) => {
    expect(routeAccess(PaymentsController, name)).toEqual({
      kind: 'can',
      keys: ['payments.view'],
    });
  });

  it.each(DEBTS)('%s is gated by the debt view capability', (name) => {
    expect(routeAccess(PaymentsController, name)).toEqual({
      kind: 'can',
      keys: ['debt.view'],
    });
  });

  it('the debtors summary also serves the home page', () => {
    expect(routeAccess(PaymentsController, 'getDebtorSummary')).toEqual({
      kind: 'can',
      keys: ['debt.view', 'dashboard.view'],
    });
  });

  it("a student's payments serve both the profile and the payment dialog", () => {
    expect(routeAccess(PaymentsController, 'findByStudent')).toEqual({
      kind: 'can',
      keys: ['students.profile', 'payments.create'],
    });
  });

  it.each([
    ...CREATES,
    ...VIEWS,
    ...DEBTS,
    'getDebtorSummary',
    'findByStudent',
  ])('%s admits the three admin roles and the Cashier by default', (name) => {
    expect(defaultRolesOf(PaymentsController, name)).toEqual(FOUR_ROLES);
  });

  describe('correct() — payment amount correction', () => {
    it('is gated by the payment correction capability', () => {
      expect(routeAccess(PaymentsController, 'correct')).toEqual({
        kind: 'can',
        keys: ['payments.correct'],
      });
    });

    it('admits the three admin roles by default, not the Cashier or the Teacher', () => {
      expect(defaultRolesOf(PaymentsController, 'correct')).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    });
  });

  describe('reverse() — payment reversal', () => {
    it('is gated by the undo capability', () => {
      expect(routeAccess(PaymentsController, 'reverse')).toEqual({
        kind: 'can',
        keys: ['money.undo'],
      });
    });

    it('admits the CEO by default, nobody else', () => {
      expect(defaultRolesOf(PaymentsController, 'reverse')).toEqual(['CEO']);
    });
  });
});

describe('PaymentsController — delegation', () => {
  let controller: PaymentsController;

  const mockService = {
    create: jest.fn().mockResolvedValue({}),
    reverse: jest.fn().mockResolvedValue({}),
    correctAmount: jest.fn().mockResolvedValue({}),
    createFromExternal: jest.fn().mockResolvedValue({}),
    findAll: jest.fn().mockResolvedValue({}),
    findOne: jest.fn().mockResolvedValue({}),
    findByStudent: jest.fn().mockResolvedValue({}),
    getDebtors: jest.fn().mockResolvedValue({}),
    getDebtorSummary: jest.fn().mockResolvedValue({}),
    getPending: jest.fn().mockResolvedValue({}),
    getDebtorsForGroup: jest.fn().mockResolvedValue({}),
    getFrozenBalances: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockService }],
    }).compile();

    controller = module.get(PaymentsController);
  });

  describe('correct() — payment amount correction', () => {
    it('should delegate to PaymentsService.correctAmount with user id, companyId and roles', () => {
      const dto = { correctAmount: 400000, reason: 'Ortiqcha summa' };
      controller.correct('payment-1', dto, 99, 1001, ['Administrator']);
      expect(mockService.correctAmount).toHaveBeenCalledWith(
        'payment-1',
        dto,
        99,
        1001,
        ['Administrator'],
      );
    });
  });

  describe('debtors list + summary', () => {
    it('delegates getDebtors with branch scope (userId + roles)', () => {
      controller.getDebtors(
        {
          branchId: 5,
          page: 2,
          pageSize: 20,
          search: 'ali',
          sortBy: 'balance',
        } as any,
        99,
        1001,
        ['Branch Director'],
      );
      expect(mockService.getDebtors).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          branchId: 5,
          page: 2,
          pageSize: 20,
          search: 'ali',
          sortBy: 'balance',
          userId: 99,
          roles: ['Branch Director'],
        }),
      );
    });

    it('delegates getDebtorSummary with userId + roles', () => {
      controller.getDebtorSummary({ branchId: 5 } as any, 99, 1001, ['CEO']);
      expect(mockService.getDebtorSummary).toHaveBeenCalledWith(1001, {
        branchId: 5,
        userId: 99,
        roles: ['CEO'],
      });
    });

    it("kartalar ro'yxat filtrlariga qaramaydi: studentStatus summary'ga o'tmaydi", () => {
      controller.getDebtorSummary(
        { branchId: 5, studentStatus: 'FROZEN' } as any,
        99,
        1001,
        ['CEO'],
      );
      expect(mockService.getDebtorSummary).toHaveBeenCalledWith(1001, {
        branchId: 5,
        userId: 99,
        roles: ['CEO'],
      });
    });
  });

  describe('frozen-balances list', () => {
    it('delegates getFrozenBalances with branch scope (userId + roles)', () => {
      controller.getFrozenBalances(
        { branchId: 2, page: 1, pageSize: 10 } as any,
        99,
        1001,
        ['Branch Director'],
      );
      expect(mockService.getFrozenBalances).toHaveBeenCalledWith(1001, {
        branchId: 2,
        page: 1,
        pageSize: 10,
        userId: 99,
        roles: ['Branch Director'],
      });
    });
  });
});
