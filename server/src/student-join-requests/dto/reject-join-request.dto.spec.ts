import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RejectJoinRequestDto } from './reject-join-request.dto';

// Same options as the global ValidationPipe in main.ts, which also transforms,
// so the service receives what `plainToInstance` returns here.
async function check(body: object) {
  const dto = plainToInstance(RejectJoinRequestDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    dto,
    messages: errors.flatMap((e) => Object.values(e.constraints ?? {})),
  };
}

describe('RejectJoinRequestDto', () => {
  it('refuses a reason of spaces', async () => {
    expect((await check({ reason: ' \t ' })).messages).toEqual([
      'Sababini yozing',
    ]);
  });

  it('keeps the trimmed reason', async () => {
    const given = await check({ reason: '  Begona odam  ' });
    expect(given.messages).toEqual([]);
    expect(given.dto.reason).toBe('Begona odam');
  });

  it('takes 500 characters and refuses 501, after the trim', async () => {
    expect(
      (await check({ reason: `  ${'a'.repeat(500)}  ` })).messages,
    ).toEqual([]);
    expect((await check({ reason: 'a'.repeat(501) })).messages).toEqual([
      'Sabab 500 belgidan oshmasin',
    ]);
  });

  it('refuses a reason that is not text, in Uzbek', async () => {
    expect((await check({ reason: 42 })).messages).toContain(
      "Sabab matn bo'lishi kerak",
    );
  });
});
