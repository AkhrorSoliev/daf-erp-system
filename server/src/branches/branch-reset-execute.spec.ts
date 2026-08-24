import { executeBranchReset, buildHistoryWhere } from './branch-reset-execute';
import { BranchResetPlan } from './branch-reset-plan';

const PLAN: BranchResetPlan = {
  branchId: 2,
  branchName: 'Namangan filali',
  companyId: 1,
  studentIds: [10795, 10796],
  studentUserIds: [20795],
  staffUserIds: [10768, 10904],
  keptUserIds: [10562],
  enrollmentIds: ['e-1'],
  groupIds: ['g-1'],
  roomIds: ['r-1'],
  courseIds: ['c-1'],
  snapshotIds: [501],
};

/** Har bir deleteMany chaqiruvini tartibi bilan yozib boradigan soxta tx. */
function recordingTx() {
  const calls: { model: string; where: any }[] = [];
  const handler: ProxyHandler<any> = {
    get(_t, model: string) {
      return {
        deleteMany: jest.fn(async ({ where }: any) => {
          calls.push({ model, where });
          return { count: 0 };
        }),
      };
    },
  };
  return { tx: new Proxy({}, handler) as any, calls };
}

/**
 * `where` obyektini HAQIQATDA baholaydi — `AND`/`OR` ichma-ichligini hisobga
 * oladi (oddiy `Object.entries` emas, aks holda `{ AND: [...] }` shaklidagi
 * kompaniya shartini ko'rmay o'tib ketardi). `{ in: [...] }` yoki tenglik.
 * Faqat shu spec faylida, entityHistory'ning kompaniya+null shartini sinash
 * uchun ishlatiladi.
 */
function evalWhere(row: Record<string, unknown>, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.AND))
    return where.AND.every((c: any) => evalWhere(row, c));
  if (Array.isArray(where.OR))
    return where.OR.some((c: any) => evalWhere(row, c));
  return Object.entries(where).every(([field, w]: [string, any]) =>
    w && typeof w === 'object' && 'in' in w
      ? w.in.includes(row[field])
      : row[field] === w,
  );
}

describe('executeBranchReset', () => {
  it("RESTRICT bog'liqliklarni ota-jadvaldan oldin o'chiradi", async () => {
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);
    const order = calls.map((c) => c.model);
    const at = (m: string) => order.indexOf(m);

    // O'quvchi tomoni
    expect(at('smsMessage')).toBeLessThan(at('student'));
    expect(at('enrollment')).toBeLessThan(at('student'));
    expect(at('enrollmentStateLog')).toBeLessThan(at('enrollment'));
    expect(at('studentBranch')).toBeLessThan(at('student'));
    // Student.userId User ga ishora qiladi, demak Student avval ketadi
    expect(at('student')).toBeLessThan(at('user'));
    // Xodim tomoni
    expect(at('notification')).toBeLessThan(at('user'));
    expect(at('userRole')).toBeLessThan(at('user'));
    expect(at('userBranch')).toBeLessThan(at('user'));
    // Guruh / xona / kurs
    expect(at('groupScheduleSnapshot')).toBeLessThan(at('group'));
    expect(at('groupHolidayExtension')).toBeLessThan(at('group'));
    expect(at('roomCapacitySnapshot')).toBeLessThan(at('room'));
    expect(at('coursePriceSnapshot')).toBeLessThan(at('course'));
    // Guruh xonaga va kursga ishora qiladi
    expect(at('group')).toBeLessThan(at('room'));
    expect(at('group')).toBeLessThan(at('course'));
  });

  it("hech qachon branchId bo'yicha o'chirmaydi", async () => {
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(JSON.stringify(call.where)).not.toContain('branchId');
    }
  });

  it("entityHistory'ning kompaniya sharti entity OR'iga tekislanib ketmaydi, NULL companyId'ni ham qabul qiladi", async () => {
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);
    const historyCall = calls.find((c) => c.model === 'entityHistory');
    expect(historyCall).toBeDefined();
    const where = historyCall!.where;

    // Kompaniya sharti hali ham `where` ichida mavjud (JSON tekshiruvi
    // tuzilma flattening bilan yo'qolib qolmaganini tasdiqlaydi).
    expect(JSON.stringify(where)).toContain('companyId');

    const inPlanEntity = {
      entityType: 'Student',
      entityId: String(PLAN.studentIds[0]),
    };

    // To'g'ri kompaniya + rejadagi entity — o'tishi kerak.
    expect(
      evalWhere({ ...inPlanEntity, companyId: PLAN.companyId }, where),
    ).toBe(true);
    // companyId NULL + rejadagi entity — ham o'tishi kerak (production'da
    // 8 ta shunday qator bor edi, ular oldin tashlab ketilardi).
    expect(evalWhere({ ...inPlanEntity, companyId: null }, where)).toBe(true);
    // Boshqa kompaniya + rejadagi entity — o'tmasligi kerak.
    expect(
      evalWhere({ ...inPlanEntity, companyId: PLAN.companyId + 1 }, where),
    ).toBe(false);
    // To'g'ri kompaniya, lekin rejaga kirmaydigan entity — o'tmasligi kerak.
    // Agar kompaniya sharti entity OR'iga tekislanib qolgan bo'lsa (flattening
    // xatosi), bu qator NOTO'G'RI o'tib ketgan bo'lardi — chunki OR'da faqat
    // BITTA a'zo mos kelishi kifoya, va companyId mos kelardi.
    expect(
      evalWhere(
        {
          entityType: 'Payment',
          entityId: 'irrelevant',
          companyId: PLAN.companyId,
        },
        where,
      ),
    ).toBe(false);
  });

  it('filial qatorini, kassani va lid ustunini umuman tegmaydi', async () => {
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);
    const touched = calls.map((c) => c.model);

    expect(touched).not.toContain('branch');
    expect(touched).not.toContain('cashAccount');
    expect(touched).not.toContain('leadColumn');
    expect(touched).not.toContain('leadSection');
  });

  it("saqlanadigan foydalanuvchiga tegishli bironta o'chirish yo'q", async () => {
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);

    for (const call of calls) {
      expect(JSON.stringify(call.where)).not.toContain('10562');
    }
  });

  it("buildHistoryWhere executeBranchReset entityHistory'ni o'chirishda ishlatgan shartning AYNAN o'zini qaytaradi", async () => {
    // Zaxira skripti (`reset-branch.ts`) xuddi shu funksiyani o'zi qayta
    // yozmasdan chaqirib, o'chirishdan oldin shu qatorlarni saqlab qoladi.
    // Bu test ikkalasi hech qachon bir-biridan uzilib qolmasligini
    // kafolatlaydi: executor'ning `where`si o'zgarsa, shu joyda darhol
    // qizarib qoladi.
    const { tx, calls } = recordingTx();
    await executeBranchReset(tx, PLAN);
    const historyCall = calls.find((c) => c.model === 'entityHistory');
    expect(historyCall).toBeDefined();
    expect(buildHistoryWhere(PLAN)).toEqual(historyCall!.where);
  });

  it("bo'sh reja bilan hech nima o'chirmaydi (ikkinchi marta ishga tushirish xavfsiz)", async () => {
    const { tx, calls } = recordingTx();
    const empty: BranchResetPlan = {
      ...PLAN,
      studentIds: [],
      studentUserIds: [],
      staffUserIds: [],
      enrollmentIds: [],
      groupIds: [],
      roomIds: [],
      courseIds: [],
      snapshotIds: [],
    };
    await executeBranchReset(tx, empty);
    expect(calls).toEqual([]);
  });
});
