import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHolidayDto } from './create-holiday.dto';
import { UpdateHolidayDto } from './update-holiday.dto';

// Same options as the global ValidationPipe in main.ts.
async function messages<T extends object>(cls: new () => T, body: object) {
  const errors = await validate(plainToInstance(cls, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('holiday DTOs: the branch', () => {
  const base = { name: 'Filial yopiq', date: '2026-09-01' };

  it('a new holiday names its branch, or none for the whole centre', async () => {
    expect(await messages(CreateHolidayDto, { ...base, branchId: 2 })).toEqual(
      [],
    );
    expect(await messages(CreateHolidayDto, base)).toEqual([]);
    expect(
      await messages(CreateHolidayDto, { ...base, branchId: null }),
    ).toEqual([]);
    expect(
      await messages(CreateHolidayDto, { ...base, branchId: 'ikki' }),
    ).toEqual(["Filial noto'g'ri ko'rsatilgan"]);
  });

  // Whose a holiday is gets fixed at creation: an edit that names a branch is
  // refused, so nobody turns a branch holiday into a centre-wide one or moves it.
  it('an edit cannot carry a branch', async () => {
    expect(
      await messages(UpdateHolidayDto, { name: 'X', branchId: 2 }),
    ).toEqual(['property branchId should not exist']);
  });
});
