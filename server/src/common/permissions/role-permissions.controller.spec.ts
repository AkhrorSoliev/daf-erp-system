import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validate } from 'class-validator';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolePermissionsController } from './role-permissions.controller';
import { defaultRolesOf, routeAccess } from './testing';

describe('RolePermissionsController', () => {
  const service = {
    overview: jest.fn().mockResolvedValue({}),
    updateRole: jest.fn().mockResolvedValue({ roleId: 3, granted: [] }),
    resetRole: jest.fn().mockResolvedValue({ roleId: 3, granted: [] }),
    history: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };
  const controller = new RolePermissionsController(service as never);

  it.each(['overview', 'update', 'reset', 'history'] as const)(
    '%s is CEO-only, never a capability (spec §4.2)',
    (name) => {
      expect(routeAccess(RolePermissionsController, name)).toEqual({
        kind: 'ceo',
      });
      expect(defaultRolesOf(RolePermissionsController, name)).toEqual(['CEO']);
    },
  );

  it('passes the company, the role and the caller to the service', async () => {
    await controller.overview(1001);
    expect(service.overview).toHaveBeenCalledWith(1001);

    const changes = [{ key: 'cash.manage' as const, granted: true }];
    await controller.update(3, { changes }, 10001, 1001);
    expect(service.updateRole).toHaveBeenCalledWith(1001, 3, changes, 10001);

    await controller.reset(3, 10001, 1001);
    expect(service.resetRole).toHaveBeenCalledWith(1001, 3, 10001);

    await controller.history({ page: 2, pageSize: 20 }, 1001);
    expect(service.history).toHaveBeenCalledWith(1001, 2, 20);
  });
});

describe('UpdateRolePermissionsDto', () => {
  const messages = (errors: ValidationError[]): string[] =>
    errors.flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...messages(e.children ?? []),
    ]);
  const check = async (body: unknown) =>
    messages(await validate(plainToInstance(UpdateRolePermissionsDto, body)));

  it('accepts catalog keys with a boolean', async () => {
    await expect(
      check({ changes: [{ key: 'cash.manage', granted: false }] }),
    ).resolves.toEqual([]);
  });

  it('refuses a key the catalog does not know, in Uzbek', async () => {
    await expect(
      check({ changes: [{ key: 'no.such', granted: true }] }),
    ).resolves.toEqual(["Noma'lum imkoniyat"]);
  });

  it('refuses an empty list and a non-boolean state', async () => {
    await expect(check({ changes: [] })).resolves.toEqual([
      "Hech qanday o'zgarish yuborilmadi",
    ]);
    await expect(
      check({ changes: [{ key: 'cash.manage', granted: 'yes' }] }),
    ).resolves.toEqual(["Imkoniyat holati noto'g'ri"]);
  });
});
