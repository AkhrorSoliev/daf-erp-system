import 'reflect-metadata';
import { NotFoundException, RequestMethod } from '@nestjs/common';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { StudentActivityController } from './student-activity.controller';

describe('StudentActivityController', () => {
  it('is student-only at class level', () => {
    expect(routeAccess(StudentActivityController, 'heartbeat')).toEqual({
      kind: 'student',
    });
    expect(defaultRolesOf(StudentActivityController, 'heartbeat')).toEqual([
      'Student',
    ]);
  });

  it('POST student-portal/activity', () => {
    expect(Reflect.getMetadata('path', StudentActivityController)).toBe(
      'student-portal',
    );
    const metod = StudentActivityController.prototype.heartbeat;
    expect(Reflect.getMetadata('path', metod)).toBe('activity');
    expect(Reflect.getMetadata('method', metod)).toBe(RequestMethod.POST);
  });

  it('studentId va companyId tokendan servisga uzatiladi', async () => {
    const servis = {
      heartbeat: jest.fn(async () => ({ activeSeconds: 1, radioSeconds: 0 })),
    };
    const c = new StudentActivityController(servis as any);
    const body = {
      sessionId: '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f',
      platform: 'WEB' as const,
      activeSeconds: 1,
      radioSeconds: 0,
      sections: {},
    };
    await c.heartbeat(body, 55, 1);
    expect(servis.heartbeat).toHaveBeenCalledWith(body, {
      studentId: 55,
      companyId: 1,
    });
  });

  it('tokenda studentId yo`q — 404', () => {
    const c = new StudentActivityController({ heartbeat: jest.fn() } as any);
    expect(() =>
      c.heartbeat(
        {
          sessionId: 'x',
          platform: 'WEB',
          activeSeconds: 0,
          radioSeconds: 0,
          sections: {},
        },
        0,
        1,
      ),
    ).toThrow(NotFoundException);
  });
});
