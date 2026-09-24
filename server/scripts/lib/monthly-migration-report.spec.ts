import {
  buildMigrationPlan,
  renderStudentCsv,
  scopeResidueVerdict,
} from './monthly-migration-report';

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

  describe('chegirma — PROD tekshiruvi 02.09.2026 (task-9c-brief.md)', () => {
    it('#10698 Azizbek Rahimov — 50% chegirma, Standart 450 000 -> 225 000', () => {
      const plan = buildMigrationPlan({
        rows: [row({ studentId: 10698, discountPercent: 50 })],
        reversedDeductions: {},
      });
      expect(plan.students[0].monthlyCharge).toBe(225_000);
    });

    it('#10080 Madina Ahrolova — 50% chegirma, Standart 450 000 -> 225 000', () => {
      const plan = buildMigrationPlan({
        rows: [row({ studentId: 10080, discountPercent: 50 })],
        reversedDeductions: {},
      });
      expect(plan.students[0].monthlyCharge).toBe(225_000);
    });

    it('#10321 Behruz Yuldashev — 35% chegirma, Intensive 740 000 -> 481 000', () => {
      const plan = buildMigrationPlan({
        rows: [
          row({
            studentId: 10321,
            monthlyPrice: 740_000,
            discountPercent: 35,
          }),
        ],
        reversedDeductions: {},
      });
      // Jami ortiqcha: 740 000 - 481 000 = 259 000 so'm/oy (brief jadvali).
      expect(plan.students[0].monthlyCharge).toBe(481_000);
    });

    it('chegirmasiz o`quvchi uchun hech narsa o`zgarmaydi', () => {
      const plan = buildMigrationPlan({
        rows: [row({ discountPercent: 0 })],
        reversedDeductions: {},
      });
      expect(plan.students[0].monthlyCharge).toBe(450_000);
    });
  });

  it('plannedLessons=0 bo`lsa hisob 0 — MonthlyChargeService.createChargeForEnrollment kabi hech narsa yozilmaydi', () => {
    const plan = buildMigrationPlan({
      rows: [row({ plannedLessons: 0, coveredLessons: 0 })],
      reversedDeductions: {},
    });
    expect(plan.students[0].monthlyCharge).toBe(0);
  });
});

describe('scopeResidueVerdict', () => {
  const v = (over: Partial<Parameters<typeof scopeResidueVerdict>[0]> = {}) =>
    scopeResidueVerdict({
      remainingInScope: 0,
      chargesSkipped: 0,
      failedEnrollments: 0,
      limited: false,
      ...over,
    });

  it("hech narsa qolmagan — o'tadi", () => {
    expect(v()).toEqual({ expected: 0, unexplained: 0, ok: true });
  });

  it('PAUSED yozilishlar qamrovda qolgani XATO EMAS (prodda 7 ta)', () => {
    // Regressiya: avvalgi "qoldiq > 0 -> xato" sharti aynan shu holatda
    // to'g'ri bajarilgan to'liq ishni yiqitardi.
    expect(v({ remainingInScope: 7, chargesSkipped: 7 })).toEqual({
      expected: 7,
      unexplained: 0,
      ok: true,
    });
  });

  it('yiqilgan o`quvchining yozilishlari ham kutilgan qoldiq', () => {
    expect(
      v({ remainingInScope: 9, chargesSkipped: 7, failedEnrollments: 2 }),
    ).toEqual({ expected: 9, unexplained: 0, ok: true });
  });

  it("tushuntirib bo'lmaydigan qoldiq — yiqiladi (C1 detektori)", () => {
    const r = v({ remainingInScope: 100, chargesSkipped: 7 });
    expect(r.ok).toBe(false);
    expect(r.unexplained).toBe(93);
  });

  it("hisobdan KO'P chiqib ketgani ham yiqiladi (qamrov noto'g'ri toraygan bo'lishi mumkin)", () => {
    const r = v({ remainingInScope: 2, chargesSkipped: 7 });
    expect(r.ok).toBe(false);
    expect(r.unexplained).toBe(-5);
  });

  it('--limit bilan tekshiruv o`tkazib yuboriladi', () => {
    expect(v({ remainingInScope: 10_000, limited: true }).ok).toBe(true);
  });
});

describe('carried-in lessons and the old-model comparison', () => {
  it('adds the carried-in credit to the new balance', () => {
    // Nothing prepaid left, the September pack (450 000) is reversed, 5
    // August-paid lessons come back, September is billed 450 000
    // -> 187 500 carries into October.
    const plan = buildMigrationPlan({
      rows: [
        row({
          balance: 0,
          prepaidRefundTotal: 0,
          carriedInCredit: 187_500,
          carriedInLessons: 5,
        }),
      ],
      reversedDeductions: { 10453: 450_000 },
    });
    const s = plan.students[0];
    expect(s.carriedInCredit).toBe(187_500);
    expect(s.newBalance).toBe(187_500);
    expect(plan.summary.totalCarriedInCredit).toBe(187_500);
    expect(plan.summary.carriedInStudentCount).toBe(1);
    expect(plan.summary.carriedInLessons).toBe(5);
  });

  it('never credits an enrollment that gets no monthly charge', () => {
    const plan = buildMigrationPlan({
      rows: [
        row({
          chargeable: false,
          prepaidRefundTotal: 0,
          carriedInCredit: 187_500,
          carriedInLessons: 5,
        }),
      ],
      reversedDeductions: {},
    });
    expect(plan.students[0].carriedInCredit).toBe(0);
    expect(plan.summary.totalCarriedInCredit).toBe(0);
  });

  it('flags a student the monthly model charges more than the old pack model', () => {
    // 600 000 a month, 18 lessons; old 19-lesson pack -> 18 x 31 579 = 568 422.
    const plan = buildMigrationPlan({
      rows: [
        row({
          monthlyPrice: 600_000,
          plannedLessons: 18,
          coveredLessons: 18,
          oldSystemMonthCost: 568_422,
        }),
      ],
      reversedDeductions: {},
    });
    expect(plan.summary.monthlyCostsMoreCount).toBe(1);
    expect(plan.summary.monthlyCostsMoreTotal).toBe(31_578);
  });

  it('does not flag a 13-lesson month, where the monthly price is cheaper', () => {
    // 13 x 37 500 = 487 500 on the old model vs 450 000 now.
    const plan = buildMigrationPlan({
      rows: [row({ oldSystemMonthCost: 487_500 })],
      reversedDeductions: {},
    });
    expect(plan.summary.monthlyCostsMoreCount).toBe(0);
    expect(plan.summary.monthlyCostsMoreTotal).toBe(0);
  });

  it('keeps the columns verify-monthly-migration.ts reads by name', () => {
    const csv = renderStudentCsv(
      buildMigrationPlan({
        rows: [row({ carriedInCredit: 187_500, carriedInLessons: 5 })],
        reversedDeductions: {},
      }),
    );
    const head = csv.split('\n')[0].split(',');
    expect(head[0]).toBe('studentId');
    expect(head).toContain('yangi_balans');
    expect(head).toContain('avgust_darslari_qaytdi');
    expect(head).toContain('12_talikda_sentabr');
  });
});
