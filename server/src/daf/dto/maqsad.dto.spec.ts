import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { MaqsadDto } from './maqsad.dto';

/** `main.ts` dagi global pipe bilan bir xil sozlama. */
describe('MaqsadDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body' as const, metatype: MaqsadDto };

  it.each(['YENGIL', 'ORTA', 'JIDDIY'])('qabul qiladi: %s', async (daraja) => {
    await expect(pipe.transform({ daraja }, meta)).resolves.toEqual({
      daraja,
    });
  });

  it("noto'g'ri qiymat va bo'sh tana — 400", async () => {
    await expect(
      pipe.transform({ daraja: 'KATTA' }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({}, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      pipe.transform({ daraja: 'ORTA', studentId: 7 }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
