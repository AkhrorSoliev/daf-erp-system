import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService.login — portal role gate', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;
  let config: any;

  const student = {
    id: 1,
    companyId: 1,
    roles: [{ role: { id: 6, name: 'Student' } }],
    branches: [],
    company: {},
  };
  const teacher = {
    id: 2,
    companyId: 1,
    roles: [{ role: { id: 4, name: 'Teacher' } }],
    branches: [],
    company: {},
  };

  beforeEach(() => {
    prisma = { student: { findFirst: jest.fn().mockResolvedValue({ id: 10001 }) } };
    jwt = { sign: jest.fn().mockReturnValue('tok') };
    config = { get: jest.fn().mockReturnValue('secret') };
    service = new AuthService(prisma, jwt, config);
  });

  it('allows a Student when X-Portal=student and attaches studentId', async () => {
    const res = await service.login(student, undefined, 'student');
    expect(res.accessToken).toBe('tok');
    expect(res.user.studentId).toBe(10001);
  });

  it('rejects a non-Student when X-Portal=student (native role gate)', async () => {
    await expect(service.login(teacher, undefined, 'student')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a Student on the admin web portal (Origin gate still works)', async () => {
    await expect(
      service.login(student, 'https://admin.dafzentrum.uz', undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('applies no restriction when neither Origin nor X-Portal is present (dev)', async () => {
    const res = await service.login(teacher, undefined, undefined);
    expect(res.accessToken).toBe('tok');
  });
});
