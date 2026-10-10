import { Test, TestingModule } from '@nestjs/testing';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentEnrollmentService } from './student-enrollment.service';
import { SmsService } from '../sms/sms.service';
import { TransactionsService } from '../transactions/transactions.service';
import { DebtAgeService } from '../common/finance/debt-age.service';
import { StudentDeparturePreviewService } from './student-departure-preview.service';
import { StudentEnrollPreviewService } from './student-enroll-preview.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

const ADMIN_ROLES = ['Administrator', 'Branch Director', 'CEO'];

describe('StudentsController — route access', () => {
  let controller: StudentsController;

  const mockStudentsService = {} as any;
  const mockEnrollmentService = {
    removeFromGroup: jest.fn().mockResolvedValue({}),
    getDebtWriteOffEligibility: jest.fn().mockResolvedValue({}),
    writeOffDroppedEnrollmentDebt: jest.fn().mockResolvedValue({}),
  };
  const mockSmsService = {} as any;
  const mockTransactionsService = {} as any;
  const mockEnrollPreview = { preview: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
        { provide: StudentsService, useValue: mockStudentsService },
        { provide: StudentEnrollmentService, useValue: mockEnrollmentService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: TransactionsService, useValue: mockTransactionsService },
        {
          provide: DebtAgeService,
          useValue: { getForStudent: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: StudentDeparturePreviewService,
          useValue: { preview: jest.fn().mockResolvedValue({}) },
        },
        { provide: StudentEnrollPreviewService, useValue: mockEnrollPreview },
      ],
    }).compile();

    controller = module.get(StudentsController);
  });

  describe('removeFromGroup() (DELETE /:id/enroll/:enrollmentId)', () => {
    it('is gated by the enrollment capability', () => {
      expect(routeAccess(StudentsController, 'removeFromGroup')).toEqual({
        kind: 'can',
        keys: ['students.enroll'],
      });
    });
    it('admits the three admin roles by default, nobody else', () => {
      expect(defaultRolesOf(StudentsController, 'removeFromGroup')).toEqual(
        ADMIN_ROLES,
      );
    });
  });

  describe('getDebtWriteOffEligibility() and writeOffCycleDebt()', () => {
    it.each(['getDebtWriteOffEligibility', 'writeOffCycleDebt'])(
      '%s is gated by the debt write-off capability',
      (method) => {
        expect(routeAccess(StudentsController, method)).toEqual({
          kind: 'can',
          keys: ['debt.write-off'],
        });
      },
    );
    it.each(['getDebtWriteOffEligibility', 'writeOffCycleDebt'])(
      '%s admits the three admin roles by default, nobody else',
      (method) => {
        expect(defaultRolesOf(StudentsController, method)).toEqual(ADMIN_ROLES);
      },
    );
  });

  describe('getLessonsOverview() (GET /:id/lessons-overview)', () => {
    it('is gated by the student details capability', () => {
      expect(routeAccess(StudentsController, 'getLessonsOverview')).toEqual({
        kind: 'can',
        keys: ['students.details'],
      });
    });
    // Monitoring ko'rinishi — Cashier ataylab KIRITILMAGAN.
    it('admits the three admin roles by default, not the Cashier or the Teacher', () => {
      expect(defaultRolesOf(StudentsController, 'getLessonsOverview')).toEqual(
        ADMIN_ROLES,
      );
    });
  });

  // O'quvchi profili. Kassir to'lov qabul qilishda ochadi; o'qituvchi yo'q —
  // shuning uchun guruh sahifasida o'qituvchiga o'quvchi ismi havolasiz
  // chiziladi (client/src/lib/role-access.ts, STUDENT_PROFILE_ROLES).
  describe('findById() (GET /:id)', () => {
    it('is gated by the student profile capability', () => {
      expect(routeAccess(StudentsController, 'findById')).toEqual({
        kind: 'can',
        keys: ['students.profile'],
      });
    });
    it('admits the three admin roles and the Cashier by default, not the Teacher', () => {
      expect(defaultRolesOf(StudentsController, 'findById')).toEqual([
        ...ADMIN_ROLES,
        'Cashier',
      ]);
    });
  });

  describe('getDeparturePreview() (GET /:id/departure-preview)', () => {
    it('is gated by the enrollment capability', () => {
      expect(routeAccess(StudentsController, 'getDeparturePreview')).toEqual({
        kind: 'can',
        keys: ['students.enroll'],
      });
    });
    it('admits the three admin roles by default, not the Cashier, Teacher or Student', () => {
      expect(defaultRolesOf(StudentsController, 'getDeparturePreview')).toEqual(
        ADMIN_ROLES,
      );
    });
  });

  describe('getEnrollPreview() (GET /:id/enroll-preview)', () => {
    it('admits the three admin roles by default, not the Cashier, Teacher or Student', () => {
      expect(defaultRolesOf(StudentsController, 'getEnrollPreview')).toEqual(
        ADMIN_ROLES,
      );
    });
    it('carries the capability of POST /:id/enroll, the call it previews', () => {
      const access = routeAccess(StudentsController, 'getEnrollPreview');
      expect(access).toEqual({ kind: 'can', keys: ['students.enroll'] });
      expect(access).toEqual(routeAccess(StudentsController, 'enrollToGroup'));
    });
    it('passes the student, company, caller, group and start day in that order', async () => {
      await controller.getEnrollPreview(
        10453,
        { groupId: 'grp-1', startDate: '2026-10-17' },
        1001,
        10001,
      );
      expect(mockEnrollPreview.preview).toHaveBeenCalledWith(
        10453,
        1001,
        10001,
        'grp-1',
        '2026-10-17',
      );
    });
  });

  /**
   * The discount no longer rewrites past charges (CEO decision 2026-08-24 —
   * a discount applies from the moment it is set). It still decides what every
   * FUTURE lesson costs, and who may set it is a CEO / Branch Director call
   * that used to live only in the browser.
   */
  describe('update() carries DiscountRoleGuard (PATCH /:id)', () => {
    it('is declared on the route, not only in the form', () => {
      // The web form hides the input from Administrators; before this guard
      // that was the ONLY thing enforcing it, and the route accepts them.
      const guards = Reflect.getMetadata(
        '__guards__',
        controller.update,
      ) as unknown[];
      const names = (guards ?? []).map((g) =>
        typeof g === 'function' ? g.name : g?.constructor?.name,
      );
      expect(names).toContain('DiscountRoleGuard');
    });
  });
});
