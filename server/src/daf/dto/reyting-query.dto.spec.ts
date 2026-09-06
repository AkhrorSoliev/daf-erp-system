import { ValidationPipe } from '@nestjs/common';
import { ReytingQueryDto } from './reyting-query.dto';

/**
 * Bu haqiqiy global pipe sozlamalari bilan ishlaydi (`main.ts`dagi bilan
 * bir xil) — yumshoqroq pipe bu yerda hech narsa tekshirmagan bo'lardi.
 * `scope` ilgari kontrollerda qo'lda (`@Query('scope')` + inline `if`)
 * tekshirilgan edi; noto'g'ri qiymat qabul qilinmasligi endi shu DTO
 * darajasida isbotlanadi.
 */
describe('ReytingQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'query' as const, metatype: ReytingQueryDto };

  it("qabul qiladi: 'gruppe' va 'zentrum'", async () => {
    await expect(pipe.transform({ scope: 'gruppe' }, meta)).resolves.toEqual({
      scope: 'gruppe',
    });
    await expect(pipe.transform({ scope: 'zentrum' }, meta)).resolves.toEqual(
      { scope: 'zentrum' },
    );
  });

  it("noto'g'ri qiymatni rad etadi", async () => {
    await expect(pipe.transform({ scope: 'filial' }, meta)).rejects.toThrow();
    await expect(pipe.transform({}, meta)).rejects.toThrow();
  });
});
