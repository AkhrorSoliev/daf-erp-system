import { Test, TestingModule } from '@nestjs/testing';
import { PaymentPromisesController } from './payment-promises.controller';
import { PaymentPromisesService } from './payment-promises.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('PaymentPromisesController — route access', () => {
  // The debt page, the outreach list and the promise dialog all read promises.
  const READS = ['findByStudent', 'monthState'] as const;
  const WRITES = ['create', 'cancel'] as const;

  it.each(READS)(
    '%s is open to the debt view, promise and outreach capabilities',
    (name) => {
      expect(routeAccess(PaymentPromisesController, name)).toEqual({
        kind: 'can',
        keys: ['debt.view', 'debt.promise', 'outreach.view'],
      });
    },
  );

  it.each(WRITES)('%s is gated by the promise capability', (name) => {
    expect(routeAccess(PaymentPromisesController, name)).toEqual({
      kind: 'can',
      keys: ['debt.promise'],
    });
  });

  it.each([...READS, ...WRITES])(
    '%s admits the three admin roles and the Cashier by default, not the Teacher',
    (name) => {
      expect(defaultRolesOf(PaymentPromisesController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
        'Cashier',
      ]);
    },
  );
});

describe('PaymentPromisesController — delegation', () => {
  let controller: PaymentPromisesController;

  const mockService = {
    create: jest.fn().mockResolvedValue({}),
    cancel: jest.fn().mockResolvedValue({}),
    findByStudent: jest.fn().mockResolvedValue([]),
    monthState: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentPromisesController],
      providers: [{ provide: PaymentPromisesService, useValue: mockService }],
    }).compile();

    controller = module.get(PaymentPromisesController);
  });

  it('delegates create to the service with userId + companyId + branch scope', () => {
    // The scope is what stops a Namangan director naming a Fargona student id:
    // every method here was keyed on `(studentId, companyId)` alone, so an id
    // was enough to read, create or cancel another branch's debt promise.
    const dto = { studentId: 10264, promiseDate: '2026-06-12', comment: 'x' };
    controller.create(dto, 99, 1001, [1]);
    expect(mockService.create).toHaveBeenCalledWith(dto, 99, 1001, [1]);
  });

  it('threads the scope through the read and the cancel too', () => {
    controller.findByStudent(10264, 1001, [2]);
    expect(mockService.findByStudent).toHaveBeenCalledWith(10264, 1001, [2]);

    controller.cancel('p1', 99, 1001, [2]);
    expect(mockService.cancel).toHaveBeenCalledWith('p1', 99, 1001, [2]);
  });

  it('GET /payment-promises/month passes the resolved scope', async () => {
    await controller.monthState(10264, 1001, [4]);
    expect(mockService.monthState).toHaveBeenCalledWith(10264, 1001, [4]);
  });
});
