import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReportsLeadFunnelController } from './reports-lead-funnel.controller';
import { RolesGuard } from '../../common/guards';
import { ROLES_KEY } from '../../common/decorators';
import { LeadFunnelPeopleQueryDto } from './lead-funnel-query.dto';

describe('ReportsLeadFunnelController', () => {
  const service = {
    getFunnel: jest.fn().mockResolvedValue({}),
    getPeople: jest.fn().mockResolvedValue({}),
  };
  const controller = new ReportsLeadFunnelController(service as never);
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const ctx = (handler: (...a: unknown[]) => unknown, roles: string[]) =>
    ({
      getHandler: () => handler,
      getClass: () => ReportsLeadFunnelController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as never;

  beforeEach(() => jest.clearAllMocks());

  it('sinf darajasida CEO, Filial direktori va Administrator', () => {
    expect(
      reflector.get<string[]>(ROLES_KEY, ReportsLeadFunnelController),
    ).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });

  for (const method of ['getFunnel', 'getPeople'] as const) {
    describe(`${method}()`, () => {
      it.each(['CEO', 'Branch Director', 'Administrator'])(
        '%s ga ruxsat',
        (role) => {
          expect(guard.canActivate(ctx(controller[method], [role]))).toBe(true);
        },
      );

      it.each(['Teacher', 'Cashier', 'Student'])('%s ga rad', (role) => {
        expect(() =>
          guard.canActivate(ctx(controller[method], [role])),
        ).toThrow(ForbiddenException);
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

  it("'people' da manba va holat filtrini uzatadi", async () => {
    await controller.getPeople(
      { stage: 'unpaid', sourceId: 'none', status: 'active' } as never,
      1001,
      [7],
    );
    expect(service.getPeople).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({
        stage: 'unpaid',
        sourceId: 'none',
        status: 'active',
      }),
      [7],
    );
  });

  describe('LeadFunnelPeopleQueryDto', () => {
    it('ruxsat etilgan holat qiymatlarini qabul qiladi', async () => {
      const dto = plainToInstance(LeadFunnelPeopleQueryDto, {
        stage: 'unpaid',
        status: 'frozen',
        sourceId: 'src-1',
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it("noma'lum holatni rad etadi", async () => {
      const dto = plainToInstance(LeadFunnelPeopleQueryDto, {
        stage: 'unpaid',
        status: 'paid',
      });
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toEqual(['status']);
    });
  });
});
