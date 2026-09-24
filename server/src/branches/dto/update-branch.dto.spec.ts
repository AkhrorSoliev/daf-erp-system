import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBranchDto } from './update-branch.dto';

// Same options as the global ValidationPipe in main.ts.
async function rejected(body: object) {
  const dto = plainToInstance(UpdateBranchDto, body);
  return (
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  ).map((e) => e.property);
}

describe('UpdateBranchDto', () => {
  it('accepts the branch details the edit form sends', async () => {
    expect(
      await rejected({
        name: "Farg'ona filiali",
        address: 'Mustaqillik 1',
        phone: '901234567',
        startOfWorkingDay: '08:00',
        endOfWorkingDay: '20:00',
      }),
    ).toEqual([]);
  });

  // A branch's state is `status`, changed only through PATCH /branches/:id/status,
  // which records history and runs the cascade. `isActive` written here changed
  // nothing any reader looks at, and `status` written here would skip both.
  it('refuses isActive and status', async () => {
    expect(await rejected({ isActive: false })).toEqual(['isActive']);
    expect(await rejected({ status: 'INACTIVE' })).toEqual(['status']);
  });
});
