import { ForbiddenException } from '@nestjs/common';
import { ReportsLeadFunnelController } from './reports-lead-funnel.controller';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';

describe('ReportsLeadFunnelController', () => {
  const service = {
    getFunnel: jest.fn().mockResolvedValue({}),
    getPeople: jest.fn().mockResolvedValue({}),
  };
  const controller = new ReportsLeadFunnelController(service as never);

  beforeEach(() => jest.clearAllMocks());

  for (const method of ['getFunnel', 'getPeople'] as const) {
    describe(`${method}()`, () => {
      it('is gated by the lead reports capability', () => {
        expect(routeAccess(ReportsLeadFunnelController, method)).toEqual({
          kind: 'can',
          keys: ['reports.leads'],
        });
      });

      it('admits the CEO, the Branch Director and the Administrator by default, nobody else', () => {
        expect(defaultRolesOf(ReportsLeadFunnelController, method)).toEqual([
          'Administrator',
          'Branch Director',
          'CEO',
        ]);
      });
    });
  }

  // Bo'sh qamrov nollar bilan javob bermaydi: «bu filialda hech kim yo'q» deb o'qilardi.
  it("bo'sh filial qamrovini 403 bilan rad etadi", () => {
    expect(() => controller.getFunnel({}, 1001, [])).toThrow(
      ForbiddenException,
    );
    expect(() =>
      controller.getPeople({ stage: 'lead' } as never, 1001, []),
    ).toThrow(ForbiddenException);
    expect(service.getFunnel).not.toHaveBeenCalled();
  });

  it("'people' da standart qiymatlarni to'ldiradi", async () => {
    await controller.getPeople({ stage: 'attended' } as never, 1001, [7]);
    expect(service.getPeople).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({
        stage: 'attended',
        mode: 'all',
        page: 1,
        pageSize: 10,
      }),
      [7],
    );
  });
});
