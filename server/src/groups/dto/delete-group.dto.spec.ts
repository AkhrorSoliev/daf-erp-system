import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteGroupDto } from './delete-group.dto';

// Same options as the global ValidationPipe in main.ts.
async function rejected(body: object) {
  const dto = plainToInstance(DeleteGroupDto, body);
  return (
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  ).map((e) => e.property);
}

describe('DeleteGroupDto', () => {
  // The dialog sends no body when the reason is left empty, and a client
  // from before the reason existed never sends one.
  it('accepts a deletion without a reason', async () => {
    expect(await rejected({})).toEqual([]);
  });

  it('accepts a reason of up to 500 characters', async () => {
    expect(await rejected({ reason: "Guruh yig'ilmadi" })).toEqual([]);
    expect(await rejected({ reason: 'x'.repeat(500) })).toEqual([]);
  });

  it('refuses a longer reason, a non-string one and unknown fields', async () => {
    expect(await rejected({ reason: 'x'.repeat(501) })).toEqual(['reason']);
    expect(await rejected({ reason: 42 })).toEqual(['reason']);
    expect(await rejected({ sabab: 'x' })).toEqual(['sabab']);
  });
});
