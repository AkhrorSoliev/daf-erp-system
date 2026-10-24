import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { StudentCertificatesController } from './student-certificates.controller';

describe('StudentCertificatesController', () => {
  it('the preview is gated by students.details: CEO, Branch Director, Administrator', () => {
    expect(routeAccess(StudentCertificatesController, 'preview')).toEqual({
      kind: 'can',
      keys: ['students.details'],
    });
    expect(defaultRolesOf(StudentCertificatesController, 'preview')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });

  it('issuing is gated by students.manage: CEO, Branch Director, Administrator', () => {
    expect(routeAccess(StudentCertificatesController, 'issue')).toEqual({
      kind: 'can',
      keys: ['students.manage'],
    });
    expect(defaultRolesOf(StudentCertificatesController, 'issue')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });

  it('passes the caller, the company, the student and the body to the service', async () => {
    const service = {
      preview: jest.fn().mockResolvedValue({ levels: [] }),
      issue: jest.fn().mockResolvedValue({ id: 'c1' }),
    };
    const controller = new StudentCertificatesController(service as never);

    await controller.preview(10001, 7, 1001);
    expect(service.preview).toHaveBeenCalledWith(7, 1001, 10001);

    await controller.issue(10001, { level: 'A1', exemptReason: 'x' }, 7, 1001);
    expect(service.issue).toHaveBeenCalledWith(7, 1001, 10001, {
      level: 'A1',
      exemptReason: 'x',
    });
  });
});
