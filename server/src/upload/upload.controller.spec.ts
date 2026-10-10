import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

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
describe('UploadController — route access', () => {
  let controller: UploadController;

  const mockService = {
    uploadFile: jest.fn().mockResolvedValue('https://cdn.example/photos/x.jpg'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [{ provide: UploadService, useValue: mockService }],
    }).compile();

    controller = module.get(UploadController);
  });

  it('carries the any-staff marker', () => {
    expect(routeAccess(UploadController, 'upload')).toEqual({
      kind: 'anyStaff',
    });
  });

  it('admits every staff role by default', () => {
    expect(defaultRolesOf(UploadController, 'upload')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
      'Cashier',
      'Teacher',
    ]);
  });

  it('keeps a student-portal token out', () => {
    expect(defaultRolesOf(UploadController, 'upload')).not.toContain('Student');
  });

  it('rejects a request with no file before reaching the service', async () => {
    await expect(controller.upload(undefined as never)).rejects.toThrow(
      'Fayl yuklanmadi',
    );
    expect(mockService.uploadFile).not.toHaveBeenCalled();
  });
});
