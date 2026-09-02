import { buildMigrationPlan } from './monthly-migration-report';

const row = (over = {}) => ({
  enrollmentId: 'enr-1',
  studentId: 10453,
  studentName: 'Aziz Karimov',
  groupId: 'grp-1',
  groupName: '#031',
  branchId: 1,
  balance: -120_000,
  prepaidLessons: 5,
  packPerLessonCost: 37_500,
  monthlyPrice: 450_000,
  plannedLessons: 13,
  coveredLessons: 13,
  ...over,
});

describe('buildMigrationPlan', () => {
  it('har o`quvchi uchun uch qadamli balans yo`lini hisoblaydi', () => {
    const plan = buildMigrationPlan({ rows: [row()], reversedDeductions: {} });
    const s = plan.students[0];

    expect(s.oldBalance).toBe(-120_000);
    expect(s.prepaidRefund).toBe(187_500); // 5 x 37 500
    expect(s.monthlyCharge).toBe(450_000);
    expect(s.newBalance).toBe(-382_500);
  });

  it('yakuniy balans = eski + prepaid - oylik (har qatorda)', () => {
    const plan = buildMigrationPlan({
      rows: [
        row(),
        row({
          enrollmentId: 'enr-2',
          studentId: 10231,
          balance: 340_000,
          prepaidLessons: 0,
        }),
      ],
      reversedDeductions: {},
    });
    for (const s of plan.students) {
      expect(s.newBalance).toBe(
        s.oldBalance + s.prepaidRefund - s.monthlyCharge,
      );
    }
  });

  it('02.09 da yechilgan pulni ham qaytarilganlar qatoriga qo`shadi', () => {
    const plan = buildMigrationPlan({
      rows: [row()],
      reversedDeductions: { 10453: 37_500 },
    });
    expect(plan.students[0].reversedSeptember).toBe(37_500);
    expect(plan.students[0].newBalance).toBe(-345_000);
  });

  it('o`quvchilarni uch holatga ajratadi', () => {
    const plan = buildMigrationPlan({
      rows: [
        row({ balance: 900_000, prepaidLessons: 0 }), // to'liq yopadi
        row({
          enrollmentId: 'e2',
          studentId: 2,
          balance: 0,
          prepaidLessons: 0,
        }), // shu oy kutilmoqda
        row({
          enrollmentId: 'e3',
          studentId: 3,
          balance: -600_000,
          prepaidLessons: 0,
        }), // eski qarz
      ],
      reversedDeductions: {},
    });

    expect(plan.summary.paidCount).toBe(1);
    expect(plan.summary.currentMonthPendingCount).toBe(1);
    expect(plan.summary.oldDebtCount).toBe(1);
  });

  it('sarhisobda eski qarzni shu oy hisobidan ajratadi', () => {
    const plan = buildMigrationPlan({
      rows: [row({ balance: -600_000, prepaidLessons: 0 })],
      reversedDeductions: {},
    });
    // Qarz 1 050 000: shundan 450 000 shu oy, 600 000 eski.
    expect(plan.summary.currentMonthDebt).toBe(450_000);
    expect(plan.summary.oldDebt).toBe(600_000);
  });

  it('eng katta o`zgarishlarni kamayish tartibida beradi', () => {
    const plan = buildMigrationPlan({
      rows: [
        row({ prepaidLessons: 1 }),
        row({ enrollmentId: 'e2', studentId: 2, prepaidLessons: 11 }),
        row({ enrollmentId: 'e3', studentId: 3, prepaidLessons: 6 }),
      ],
      reversedDeductions: {},
    });
    const deltas = plan.biggestChanges.map((s) =>
      Math.abs(s.newBalance - s.oldBalance),
    );
    expect([...deltas].sort((a, b) => b - a)).toEqual(deltas);
  });

  it('bir o`quvchining bir nechta yozilishini birlashtiradi', () => {
    const plan = buildMigrationPlan({
      rows: [row(), row({ enrollmentId: 'enr-2', groupId: 'grp-2' })],
      reversedDeductions: {},
    });
    expect(plan.students).toHaveLength(1);
    expect(plan.students[0].monthlyCharge).toBe(900_000); // ikki guruh
  });
});
