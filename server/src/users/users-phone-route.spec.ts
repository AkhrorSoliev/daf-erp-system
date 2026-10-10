import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersController } from './users.controller';
import { ROLE_ID } from '../common/auth/role-ids';
import type { RouteAccessMeta } from '../common/permissions/access.decorators';
import { allows } from '../common/permissions/permission.guard';
import { fakePermissions, routeAccess } from '../common/permissions/testing';
import { ChangePhoneDto } from './dto/change-phone.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateTeacherDto } from '../teachers/dto/update-teacher.dto';

/** The same options the global ValidationPipe runs with (main.ts). */
async function invalidProperties(cls: new () => object, body: object) {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property).sort();
}

describe('PATCH /users/phone — your own phone behind your password (ADR-0031)', () => {
  const marker = routeAccess(
    UsersController,
    'changePhone',
  ) as unknown as RouteAccessMeta;

  const admits = async (roleId: number) =>
    allows(marker, await fakePermissions([roleId]).forUser(1));

  it('carries the any-staff marker and lets every staff role through', async () => {
    expect(marker).toEqual({ kind: 'anyStaff' });
    for (const roleId of [
      ROLE_ID.CEO,
      ROLE_ID.BRANCH_DIRECTOR,
      ROLE_ID.ADMINISTRATOR,
      ROLE_ID.TEACHER,
      ROLE_ID.CASHIER,
    ]) {
      expect(await admits(roleId)).toBe(true);
    }
  });

  it('refuses a student token: a student does not change their own sign-in number', async () => {
    expect(await admits(ROLE_ID.STUDENT)).toBe(false);
  });

  it('is declared before PATCH /users/:id, which would otherwise swallow "phone"', () => {
    const methods = Object.getOwnPropertyNames(UsersController.prototype);
    expect(methods.indexOf('changePhone')).toBeGreaterThan(-1);
    expect(methods.indexOf('changePhone')).toBeLessThan(
      methods.indexOf('update'),
    );
  });
});

describe('ChangePhoneDto', () => {
  it('takes a 9-digit phone with the current password', async () => {
    expect(
      await invalidProperties(ChangePhoneDto, {
        phone: '909998877',
        currentPassword: 'secret1',
      }),
    ).toEqual([]);
  });

  it('refuses a missing or empty current password', async () => {
    expect(
      await invalidProperties(ChangePhoneDto, { phone: '909998877' }),
    ).toEqual(['currentPassword']);
    expect(
      await invalidProperties(ChangePhoneDto, {
        phone: '909998877',
        currentPassword: '',
      }),
    ).toEqual(['currentPassword']);
  });

  it('refuses a phone that is not 9 digits', async () => {
    expect(
      await invalidProperties(ChangePhoneDto, {
        phone: '+998909998877',
        currentPassword: 'secret1',
      }),
    ).toEqual(['phone']);
  });
});

describe('UpdateProfileDto', () => {
  it('refuses a phone: the profile door is name and photo only', async () => {
    expect(
      await invalidProperties(UpdateProfileDto, { phone: '909998877' }),
    ).toEqual(['phone']);
  });

  it('still takes a name', async () => {
    expect(
      await invalidProperties(UpdateProfileDto, {
        firstName: 'Akmal',
        lastName: 'Karimov',
      }),
    ).toEqual([]);
  });
});

describe('the admin edit forms take a phone or nothing, never null', () => {
  // `@IsOptional()` lets null through, and a null phone would reach
  // planPhoneChange as "some staff account with no phone" (ADR-0031).
  it.each([
    ['UpdateUserDto', UpdateUserDto],
    ['UpdateTeacherDto', UpdateTeacherDto],
  ])('%s refuses phone: null', async (_name, cls) => {
    expect(await invalidProperties(cls, { phone: null })).toEqual(['phone']);
  });

  it.each([
    ['UpdateUserDto', UpdateUserDto],
    ['UpdateTeacherDto', UpdateTeacherDto],
  ])('%s still takes no phone at all, or a 9-digit one', async (_name, cls) => {
    expect(await invalidProperties(cls, {})).toEqual([]);
    expect(await invalidProperties(cls, { phone: '909998877' })).toEqual([]);
  });
});
