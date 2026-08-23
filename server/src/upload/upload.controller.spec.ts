import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY, STAFF_ROLES } from '../common/decorators';

/**
 * `POST /upload` carried no `@Roles` at all, so the global `JwtAuthGuard` was
 * the only thing in front of it — and that guard proves nothing beyond "this
 * token is valid", which a student-portal token also is. Production has 796
 * accounts holding the Student role, and the destination is a PUBLIC bucket.
 *
 * Students were never meant to use this route: they upload through
 * `POST /student-portal/photo`, and the three screens calling this one all
 * live in the dashboard.
 */
describe('UploadController — role guard', () => {
  let controller: UploadController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    uploadFile: jest.fn().mockResolvedValue('https://cdn.example/photos/x.jpg'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [{ provide: UploadService, useValue: mockService }],
    }).compile();

    controller = module.get(UploadController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function contextFor(roles: string[]) {
    return {
      getHandler: () => controller.upload,
      getClass: () => UploadController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as never;
  }

  it('declares the staff roles', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, controller.upload);
    expect(roles).toEqual([...STAFF_ROLES]);
  });

  it.each([...STAFF_ROLES])('allows %s', (role) => {
    expect(guard.canActivate(contextFor([role]))).toBe(true);
  });

  it('denies a student-portal token', () => {
    expect(() => guard.canActivate(contextFor(['Student']))).toThrow(
      ForbiddenException,
    );
  });

  it('denies a token carrying no roles', () => {
    expect(() => guard.canActivate(contextFor([]))).toThrow(ForbiddenException);
  });

  it('rejects a request with no file before reaching the service', async () => {
    await expect(controller.upload(undefined as never)).rejects.toThrow(
      'Fayl yuklanmadi',
    );
    expect(mockService.uploadFile).not.toHaveBeenCalled();
  });
});
