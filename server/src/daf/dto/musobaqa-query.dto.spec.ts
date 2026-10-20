import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { MusobaqaQueryDto } from './musobaqa-query.dto';

/** `main.ts` dagi global pipe bilan bir xil sozlama. */
describe('MusobaqaQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'query' as const, metatype: MusobaqaQueryDto };

  it.each([{ hafta: '2026-10-19' }, {}])('qabul qiladi: %p', async (q) => {
    await expect(pipe.transform(q, meta)).resolves.toEqual(q);
  });

  it.each(['19.10.2026', '2026-10-19; DROP'])(
    'rad etadi: %s',
    async (hafta) => {
      await expect(pipe.transform({ hafta }, meta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});
