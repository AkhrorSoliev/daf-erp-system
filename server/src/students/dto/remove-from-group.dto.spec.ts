import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RemoveFromGroupDto } from './remove-from-group.dto';

// Same options as the global ValidationPipe in main.ts.
async function rejected(body: object) {
  const dto = plainToInstance(RemoveFromGroupDto, body);
  return (
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  ).map((e) => e.property);
}

describe('RemoveFromGroupDto — departurePolicy (ADR-0043)', () => {
  // A client from before the contract never sends it: the student's own
  // decision is the default.
  it('accepts a removal without a policy', async () => {
    expect(await rejected({ reason: "O'z xohishi bilan" })).toEqual([]);
  });

  it('accepts each of the three policies', async () => {
    for (const departurePolicy of [
      'STUDENT_CANCELLED',
      'CENTER_INITIATIVE',
      'QUALITY_CLAIM',
    ]) {
      expect(await rejected({ reason: 'x', departurePolicy })).toEqual([]);
    }
  });

  it('refuses anything else', async () => {
    expect(
      await rejected({ reason: 'x', departurePolicy: 'COURSE_NOT_STARTED' }),
    ).toEqual(['departurePolicy']);
    expect(await rejected({ reason: 'x', departurePolicy: 1 })).toEqual([
      'departurePolicy',
    ]);
  });
});
