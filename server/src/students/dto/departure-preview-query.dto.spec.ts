import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeparturePreviewQueryDto } from './departure-preview-query.dto';

async function rejected(query: object) {
  const dto = plainToInstance(DeparturePreviewQueryDto, query);
  return (
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  ).map((e) => e.property);
}

describe('DeparturePreviewQueryDto', () => {
  it('accepts no enrollment (an expulsion or an archive) and one enrollment id', async () => {
    expect(await rejected({})).toEqual([]);
    expect(
      await rejected({ enrollmentId: '4b0a3c52-9f5e-4d8e-9a57-0d2b6f1e7c11' }),
    ).toEqual([]);
  });

  it('refuses an enrollment id that is not a UUID', async () => {
    expect(await rejected({ enrollmentId: 'enr-1' })).toEqual(['enrollmentId']);
  });
});
