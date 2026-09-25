import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY, STAFF_ROLES } from '../common/decorators';
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
  let controller: UsersController;
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: {} },
        { provide: RedisService, useValue: {} },
        // The controller issues fresh sessions (ADR-0030); unused here.
        { provide: AuthService, useValue: {} },
      ],
    }).compile();
    controller = module.get(UsersController);
  });

  function contextFor(roles: string[]) {
    return {
      getHandler: () => controller.changePhone,
      getClass: () => UsersController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as any;
  }

  it('carries @Roles(...STAFF_ROLES) and lets every staff role through', () => {
    expect(reflector.get<string[]>(ROLES_KEY, controller.changePhone)).toEqual([
      ...STAFF_ROLES,
    ]);
    for (const role of STAFF_ROLES) {
      expect(guard.canActivate(contextFor([role]))).toBe(true);
    }
  });

  it('refuses a student token: a student does not change their own sign-in number', () => {
    expect(() => guard.canActivate(contextFor(['Student']))).toThrow(
      ForbiddenException,
    );
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
