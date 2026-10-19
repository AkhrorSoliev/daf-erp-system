import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { EslatmalarDto } from './eslatmalar.dto';

/** `main.ts` dagi global pipe bilan bir xil sozlama. */
describe('EslatmalarDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body' as const, metatype: EslatmalarDto };

  it.each([true, false])('qabul qiladi: %p', async (yoqilgan) => {
    await expect(pipe.transform({ yoqilgan }, meta)).resolves.toEqual({
      yoqilgan,
    });
  });

  it("matn, bo'sh tana va ortiqcha maydon — 400", async () => {
    for (const body of [
      { yoqilgan: 'true' },
      {},
      { yoqilgan: true, studentId: 7 },
    ]) {
      await expect(pipe.transform(body, meta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });
});
