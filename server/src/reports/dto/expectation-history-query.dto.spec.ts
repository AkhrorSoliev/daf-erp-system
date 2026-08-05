import { ValidationPipe } from '@nestjs/common';
import { ExpectationHistoryQueryDto } from './expectation-history-query.dto';

/**
 * This endpoint shipped returning 400 for every request the UI made. The cause
 * was invisible to a type-check and to a compile: the handler declared
 * `@Query() query: ReportsQueryDto` alongside a separate `@Query('month')`, and
 * the global pipe's `forbidNonWhitelisted` rejected `month` because that shared
 * DTO does not declare it.
 *
 * These run the REAL pipe with the REAL global settings, so the same mistake
 * cannot come back quietly.
 */
describe('ExpectationHistoryQueryDto', () => {
  // Mirrors main.ts exactly — a laxer pipe here would test nothing.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = {
    type: 'query' as const,
    metatype: ExpectationHistoryQueryDto,
  };

  it('accepts the exact query the overview dialog sends', async () => {
    const out = await pipe.transform(
      { branchId: '1', month: '2026-08' },
      meta,
    );
    expect(out).toEqual({ branchId: 1, month: '2026-08' });
  });

  it('accepts month alone, branchId alone, and neither', async () => {
    await expect(pipe.transform({ month: '2026-08' }, meta)).resolves.toEqual({
      month: '2026-08',
    });
    await expect(pipe.transform({ branchId: '2' }, meta)).resolves.toEqual({
      branchId: 2,
    });
    await expect(pipe.transform({}, meta)).resolves.toEqual({});
  });

  it('rejects a malformed month instead of quietly answering another one', async () => {
    await expect(pipe.transform({ month: '2026-13' }, meta)).rejects.toThrow();
    await expect(pipe.transform({ month: 'xyz' }, meta)).rejects.toThrow();
    await expect(pipe.transform({ month: '2026-8' }, meta)).rejects.toThrow();
  });

  it('rejects an unknown parameter, as the global pipe is configured to', async () => {
    await expect(
      pipe.transform({ month: '2026-08', nope: '1' }, meta),
    ).rejects.toThrow();
  });
});
