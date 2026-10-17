import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RevokeCertificateDto } from './revoke-certificate.dto';

async function check(body: unknown) {
  const dto = plainToInstance(RevokeCertificateDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
}

describe('RevokeCertificateDto', () => {
  it('accepts a reason and trims it', async () => {
    const { dto, errors } = await check({ reason: '  Noto‘g‘ri berilgan  ' });
    expect(errors).toHaveLength(0);
    expect(dto.reason).toBe('Noto‘g‘ri berilgan');
  });

  it('accepts exactly 3 and exactly 500 characters', async () => {
    expect((await check({ reason: 'abc' })).errors).toHaveLength(0);
    expect((await check({ reason: 'a'.repeat(500) })).errors).toHaveLength(0);
  });

  // no reason, empty, two characters after trimming, only spaces, 501
  // characters, not a string, an unknown field
  it.each([
    {},
    { reason: '' },
    { reason: '  ab  ' },
    { reason: '          ' },
    { reason: 'a'.repeat(501) },
    { reason: 123 },
    { reason: 'yaxshi sabab', extra: 1 },
  ])('rejects %j', async (body) => {
    expect((await check(body)).errors.length).toBeGreaterThan(0);
  });

  it('speaks Uzbek', async () => {
    const { errors } = await check({ reason: 'ab' });
    const text = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(text.join(' ')).toMatch(/Sabab/);
  });
});
