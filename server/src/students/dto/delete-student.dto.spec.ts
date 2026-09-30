import { ValidationPipe } from '@nestjs/common';
import { DeleteStudentDto } from './delete-student.dto';

/**
 * Run through the global pipe exactly as `main.ts` configures it. The status
 * dialog archives through `DELETE /students/:id` and sends the reason picked
 * from the list as `reasonId`; the DTO used to know only `reason`, so every
 * archive with a picked reason was refused before it reached the service.
 */
describe('DeleteStudentDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body' as const, metatype: DeleteStudentDto };
  const REASON_ID = '4f0c1d9e-8a6b-4c3e-9f21-7d5b2a1e0c33';

  it('accepts what the status dialog sends: a picked reason, with or without a comment', async () => {
    await expect(
      pipe.transform({ reasonId: REASON_ID, reason: 'Ikki marta' }, meta),
    ).resolves.toEqual({ reasonId: REASON_ID, reason: 'Ikki marta' });
    await expect(
      pipe.transform({ reasonId: REASON_ID }, meta),
    ).resolves.toEqual({ reasonId: REASON_ID });
  });

  it("still accepts what the card's archive dialog sends: the reason as text", async () => {
    await expect(
      pipe.transform({ reason: 'Duplikat yozuv' }, meta),
    ).resolves.toEqual({ reason: 'Duplikat yozuv' });
  });
});
