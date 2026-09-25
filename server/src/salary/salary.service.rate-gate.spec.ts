import { ForbiddenException } from '@nestjs/common';
import { SalaryService } from './salary.service';

/**
 * ADR-0033: the caller is checked BEFORE a rate is created. The gate lives in
 * the facade because `SalaryConfigService.createConfig` has no other caller —
 * controller -> this facade is the only path.
 *
 * `updateConfig` (PATCH) has no gate any more — it is CEO-only at the
 * controller (`@Roles('CEO')`), so this facade is plain delegation.
 */
describe('SalaryService — rate write gate (ADR-0033)', () => {
  const make = (config: any) =>
    new SalaryService(
      config,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('checks the caller before creating a rate', async () => {
    const calls: string[] = [];
    const config = {
      assertCallerMayCreateRate: jest.fn(async () => {
        calls.push('gate');
      }),
      createConfig: jest.fn(async () => {
        calls.push('write');
        return { id: 'cfg' };
      }),
    };
    const dto = { userId: 20001, salaryType: 'PERCENTAGE', value: 40 } as any;

    await make(config).createConfig(dto, 1001, 90010);

    expect(config.assertCallerMayCreateRate).toHaveBeenCalledWith(
      90010,
      1001,
      dto,
    );
    expect(calls).toEqual(['gate', 'write']);
  });

  it('never writes when the gate refuses', async () => {
    const config = {
      assertCallerMayCreateRate: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('rad')),
      createConfig: jest.fn(),
    };
    await expect(
      make(config).createConfig({} as any, 1001, 90010),
    ).rejects.toThrow(ForbiddenException);
    expect(config.createConfig).not.toHaveBeenCalled();
  });

  it('delegates an update directly with no gate call (PATCH is CEO-only)', async () => {
    const config = {
      updateConfig: jest.fn().mockResolvedValue({ id: 'cfg' }),
    };
    const dto = { value: 45 } as any;

    const result = await make(config).updateConfig('cfg', dto, 1001, 90010);

    expect(config.updateConfig).toHaveBeenCalledWith('cfg', dto, 1001, 90010);
    expect(result).toEqual({ id: 'cfg' });
  });
});
