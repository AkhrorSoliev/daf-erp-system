import {
  buildBranchResetPlan,
  verifyBranchResetPlan,
  assertBranchIsFinanciallyEmpty,
  assertNoBlockingDependents,
  assertNoInboundReferences,
  BranchResetUnsafeError,
  BranchResetPlan,
} from './branch-reset-plan';

/**
 * `where` ichidagi bitta shartni tekshiradi: `{ in: [...] }` yoki oddiy
 * tenglik. Barcha soxta mijozlar (fakePrisma va fakePrismaWithMoney) shu bitta
 * funksiyani ishlatadi — ikkinchi mos keltiruvchi yozilmaydi.
 */
const inList = (v: unknown, w: any): boolean => {
  if (w === undefined) return true;
  if (Array.isArray(w?.in)) return w.in.includes(v);
  if (Array.isArray(w?.notIn)) return !w.notIn.includes(v);
  return v === w;
};

/**
 * Prisma o'rniga qo'yiladigan soxta mijoz. Faqat reja yig'uvchi va tekshiruvchi
 * chaqiradigan metodlar bor.
 */
function fakePrisma(data: {
  branch?: { id: number; name: string; companyId: number } | null;
  studentBranches?: { studentId: number; branchId: number }[];
  students?: { id: number; userId: number | null }[];
  userBranches?: { userId: number; branchId: number }[];
  groups?: { id: string; branchId: number; roomId?: string | null }[];
  rooms?: { id: string; branchId: number }[];
  courses?: { id: string; branchId: number }[];
  enrollments?: { id: string; groupId: string }[];
  snapshots?: { id: number; branchId: number | null }[];
  groupTeachers?: { groupId: string; teacherId: number }[];
}) {
  const d = {
    branch:
      data.branch === undefined
        ? { id: 2, name: 'Namangan filali', companyId: 1 }
        : data.branch,
    studentBranches: data.studentBranches ?? [],
    students: data.students ?? [],
    userBranches: data.userBranches ?? [],
    groups: data.groups ?? [],
    rooms: data.rooms ?? [],
    courses: data.courses ?? [],
    enrollments: data.enrollments ?? [],
    snapshots: data.snapshots ?? [],
    groupTeachers: data.groupTeachers ?? [],
  };
  return {
    branch: { findUnique: jest.fn(async () => d.branch) },
    studentBranch: {
      findMany: jest.fn(async ({ where }: any) =>
        d.studentBranches.filter(
          (r) => inList(r.branchId, where?.branchId) && inList(r.studentId, where?.studentId),
        ),
      ),
    },
    student: {
      findMany: jest.fn(async ({ where }: any) =>
        d.students.filter((r) => inList(r.id, where?.id)),
      ),
    },
    userBranch: {
      findMany: jest.fn(async ({ where }: any) =>
        d.userBranches.filter(
          (r) => inList(r.branchId, where?.branchId) && inList(r.userId, where?.userId),
        ),
      ),
    },
    group: {
      findMany: jest.fn(async ({ where }: any) =>
        d.groups.filter(
          (r) =>
            inList(r.branchId, where?.branchId) &&
            inList(r.id, where?.id) &&
            inList(r.roomId ?? null, where?.roomId),
        ),
      ),
    },
    groupTeacher: {
      findMany: jest.fn(async ({ where }: any) =>
        d.groupTeachers.filter(
          (r) => inList(r.teacherId, where?.teacherId) && inList(r.groupId, where?.groupId),
        ),
      ),
    },
    room: {
      findMany: jest.fn(async ({ where }: any) =>
        d.rooms.filter((r) => inList(r.branchId, where?.branchId) && inList(r.id, where?.id)),
      ),
    },
    course: {
      findMany: jest.fn(async ({ where }: any) =>
        d.courses.filter((r) => inList(r.branchId, where?.branchId) && inList(r.id, where?.id)),
      ),
    },
    enrollment: {
      findMany: jest.fn(async ({ where }: any) =>
        d.enrollments.filter((r) => inList(r.groupId, where?.groupId)),
      ),
    },
    dailyFinancialSnapshot: {
      findMany: jest.fn(async ({ where }: any) =>
        d.snapshots.filter(
          (r) => inList(r.branchId, where?.branchId) && inList(r.id, where?.id),
        ),
      ),
    },
  } as any;
}

/** Namangan'ning haqiqiy shakli: 1 CEO ikkala filialda, 2 xodim faqat bunda. */
const namanganish = {
  branch: { id: 2, name: 'Namangan filali', companyId: 1 },
  studentBranches: [
    { studentId: 10795, branchId: 2 },
    { studentId: 10796, branchId: 2 },
  ],
  students: [
    { id: 10795, userId: 20795 },
    { id: 10796, userId: null },
  ],
  userBranches: [
    { userId: 10562, branchId: 1 }, // CEO — ikkala filialda
    { userId: 10562, branchId: 2 },
    { userId: 10768, branchId: 2 },
    { userId: 10904, branchId: 2 },
  ],
  groups: [{ id: 'g-1', branchId: 2 }],
  rooms: [{ id: 'r-1', branchId: 2 }],
  courses: [{ id: 'c-1', branchId: 2 }],
  enrollments: [{ id: 'e-1', groupId: 'g-1' }],
  snapshots: [{ id: 501, branchId: 2 }],
};

describe('buildBranchResetPlan', () => {
  it('yig\'adi: o\'quvchi, ularning akkaunti, guruh, xona, kurs, enrollment, surat', async () => {
    const plan = await buildBranchResetPlan(fakePrisma(namanganish), 2);

    expect(plan.branchId).toBe(2);
    expect(plan.branchName).toBe('Namangan filali');
    expect(plan.studentIds.sort()).toEqual([10795, 10796]);
    expect(plan.studentUserIds).toEqual([20795]); // userId null bo'lgani tushib qoladi
    expect(plan.groupIds).toEqual(['g-1']);
    expect(plan.roomIds).toEqual(['r-1']);
    expect(plan.courseIds).toEqual(['c-1']);
    expect(plan.enrollmentIds).toEqual(['e-1']);
    expect(plan.snapshotIds).toEqual([501]);
  });

  it('ikkala filialdagi foydalanuvchini o\'chirish ro\'yxatidan chiqarib tashlaydi', async () => {
    const plan = await buildBranchResetPlan(fakePrisma(namanganish), 2);

    expect(plan.staffUserIds.sort()).toEqual([10768, 10904]);
    expect(plan.staffUserIds).not.toContain(10562);
    expect(plan.keptUserIds).toEqual([10562]);
  });

  it('mavjud bo\'lmagan filial uchun xato tashlaydi', async () => {
    await expect(
      buildBranchResetPlan(fakePrisma({ branch: null }), 99),
    ).rejects.toThrow(BranchResetUnsafeError);
  });
});

describe('verifyBranchResetPlan', () => {
  const clean = async (): Promise<[any, BranchResetPlan]> => {
    const prisma = fakePrisma(namanganish);
    return [prisma, await buildBranchResetPlan(prisma, 2)];
  };

  it('toza rejadan o\'tkazadi', async () => {
    const [prisma, plan] = await clean();
    await expect(verifyBranchResetPlan(prisma, plan)).resolves.toBeUndefined();
  });

  it('boshqa filialda ham turgan o\'quvchini tutadi', async () => {
    const [, plan] = await clean();
    const prisma = fakePrisma({
      ...namanganish,
      studentBranches: [...namanganish.studentBranches, { studentId: 10795, branchId: 1 }],
    });
    await expect(verifyBranchResetPlan(prisma, plan)).rejects.toThrow(/10795/);
  });

  it('boshqa filialning guruhini tutadi', async () => {
    const [, plan] = await clean();
    plan.groupIds.push('g-fargona');
    const prisma = fakePrisma({
      ...namanganish,
      groups: [...namanganish.groups, { id: 'g-fargona', branchId: 1 }],
    });
    await expect(verifyBranchResetPlan(prisma, plan)).rejects.toThrow(/g-fargona/);
  });

  it('boshqa filialda ham turgan xodim rejaga sizib kirsa tutadi', async () => {
    const [prisma, plan] = await clean();
    plan.staffUserIds.push(10562); // CEO'ni qo'lda kiritib ko'ramiz
    await expect(verifyBranchResetPlan(prisma, plan)).rejects.toThrow(/10562/);
  });

  it('boshqa filialning xonasi yoki kursini tutadi', async () => {
    const [, plan] = await clean();
    plan.roomIds.push('r-fargona');
    const prisma = fakePrisma({
      ...namanganish,
      rooms: [...namanganish.rooms, { id: 'r-fargona', branchId: 1 }],
    });
    await expect(verifyBranchResetPlan(prisma, plan)).rejects.toThrow(/r-fargona/);
  });

  it('boshqa filialning kunlik suratini tutadi', async () => {
    const [, plan] = await clean();
    plan.snapshotIds.push(999);
    const prisma = fakePrisma({
      ...namanganish,
      snapshots: [...namanganish.snapshots, { id: 999, branchId: 1 }],
    });
    await expect(verifyBranchResetPlan(prisma, plan)).rejects.toThrow(/999/);
  });

  it("o'quvchi akkaunti boshqa filialda xodim sifatida ham turgan bo'lsa tutadi", async () => {
    const [, plan] = await clean();
    // 20795 — Namangan o'quvchisi #10795ning akkaunti; endi u boshqa
    // filialda (#1) xodim sifatida ham UserBranch qatoriga ega bo'lib qoladi.
    const prisma = fakePrisma({
      ...namanganish,
      userBranches: [...namanganish.userBranches, { userId: 20795, branchId: 1 }],
    });
    await expect(verifyBranchResetPlan(prisma, plan)).rejects.toThrow(/20795/);
  });

  it("o'quvchi akkaunti saqlanadigan (kept) foydalanuvchilar ro'yxatiga ham kirib qolsa tutadi", async () => {
    const [prisma, plan] = await clean();
    plan.keptUserIds.push(20795); // 20795 studentUserIds ichida ham bor
    await expect(verifyBranchResetPlan(prisma, plan)).rejects.toThrow(/20795/);
  });
});

describe('assertNoInboundReferences', () => {
  it("bog'lanish yo'q toza rejadan o'tkazadi", async () => {
    const prisma = fakePrismaWithMoney(namanganish, {});
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertNoInboundReferences(prisma, plan)).resolves.toBeUndefined();
  });

  it("boshqa filial guruhidagi GroupTeacher.teacherId (reja foydalanuvchisi) ni tutadi", async () => {
    const prisma = fakePrismaWithMoney(
      {
        ...namanganish,
        groups: [...namanganish.groups, { id: 'g-fargona', branchId: 1 }],
        groupTeachers: [{ groupId: 'g-fargona', teacherId: 10768 }],
      },
      {},
    );
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertNoInboundReferences(prisma, plan)).rejects.toThrow(
      /GroupTeacher\.teacherId: 1/,
    );
  });

  it("boshqa filial guruhidagi Group.roomId (reja xonasi) ni tutadi", async () => {
    const prisma = fakePrismaWithMoney(
      {
        ...namanganish,
        groups: [...namanganish.groups, { id: 'g-fargona-room', branchId: 1, roomId: 'r-1' }],
      },
      {},
    );
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertNoInboundReferences(prisma, plan)).rejects.toThrow(/Group\.roomId: 1/);
  });

  it("reja guruhiga bog'langan, lekin reja o'quvchisiga tegishli bo'lmagan Contract.groupId ni tutadi", async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      contract: [{ id: 'c-stray', groupId: 'g-1', studentId: 99999 }],
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    expect(plan.studentIds).not.toContain(99999);
    await expect(assertNoInboundReferences(prisma, plan)).rejects.toThrow(/Contract\.groupId: 1/);
  });

  it("reja guruhiga bog'langan, lekin reja foydalanuvchisiga tegishli bo'lmagan EmployeeSalaryConfig.groupId ni tutadi", async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      employeeSalaryConfig: [{ id: 'esc-stray', groupId: 'g-1', userId: 99999 }],
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    expect(plan.staffUserIds).not.toContain(99999);
    expect(plan.studentUserIds).not.toContain(99999);
    await expect(assertNoInboundReferences(prisma, plan)).rejects.toThrow(
      /EmployeeSalaryConfig\.groupId: 1/,
    );
  });

  it('reja o\'quvchisiga bog\'langan MockExamParticipant.studentId ni tutadi', async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      mockExamParticipant: [{ id: 'mep-1', studentId: 10795 }],
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertNoInboundReferences(prisma, plan)).rejects.toThrow(
      /MockExamParticipant\.studentId: 1/,
    );
  });

  it('ikkita turli bloklovchini bitta xabarda sanaydi', async () => {
    const prisma = fakePrismaWithMoney(
      {
        ...namanganish,
        groups: [...namanganish.groups, { id: 'g-fargona', branchId: 1 }],
        groupTeachers: [{ groupId: 'g-fargona', teacherId: 10768 }],
      },
      { mockExamParticipant: [{ id: 'mep-1', studentId: 10795 }] },
    );
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertNoInboundReferences(prisma, plan)).rejects.toThrow(
      /GroupTeacher\.teacherId: 1[\s\S]*MockExamParticipant\.studentId: 1/,
    );
  });
});

type MoneyModel =
  | 'payment'
  | 'transaction'
  | 'attendance'
  | 'salaryAccrual'
  | 'contract'
  | 'refund'
  | 'cashMovement'
  | 'expense'
  // `assertNoBlockingDependents` bilan bog'liq — RESTRICT bog'langan, lekin
  // `executeBranchReset` hech qachon o'chirmaydigan jadvallar.
  | 'callLog'
  | 'discount'
  | 'paymentPromise'
  | 'plannedAbsence'
  | 'scholarship'
  | 'lessonCancellation'
  | 'lessonReschedule'
  | 'lessonTeacherOverride'
  | 'comment'
  | 'commentAssignee'
  | 'employeeSalaryConfig'
  | 'salaryPayment'
  // `assertNoInboundReferences` bilan bog'liq — SET NULL/CASCADE bilan
  // bog'langan, reja tashqarisidan reja ichidagi ID ga ishora qilishi
  // mumkin bo'lgan jadvallar.
  | 'mockExamParticipant';

/**
 * `where` ni HAQIQATDA hisobga oladi: top-level `OR` massivi (har bir shart
 * mustaqil tekshiriladi, biri mos kelsa yetarli) va oddiy maydon shartlari
 * (`inList` orqali — `{ in: [...] }` yoki tenglik). Eski versiya `where` ni
 * butunlay e'tiborsiz qoldirib, faqat model nomi bo'yicha son qaytarardi —
 * shu sababli qamrov regressiyasini (masalan CashMovement kompaniya bo'ylab
 * sanalsa yoki Attendance studentId bo'yicha kalitlansa) sinov payqamas edi.
 */
function matchesWhere(row: Record<string, unknown>, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.OR)) {
    return where.OR.some((clause: any) => matchesWhere(row, clause));
  }
  return Object.entries(where).every(([field, w]) => inList(row[field], w));
}

/**
 * fakePrisma ga qo'shimcha: moliyaviy jadval SATRLARI (sanoq emas). Har bir
 * `count()` chaqiruvi haqiqiy `where` bilan filtrlaydi. Ko'rsatilmagan jadval
 * bo'sh ro'yxatdan boshlanadi (0 ta satr).
 */
function fakePrismaWithMoney(
  data: Parameters<typeof fakePrisma>[0],
  rows: Partial<Record<MoneyModel, Record<string, unknown>[]>>,
) {
  const base = fakePrisma(data);
  const models: MoneyModel[] = [
    'payment',
    'transaction',
    'attendance',
    'salaryAccrual',
    'contract',
    'refund',
    'cashMovement',
    'expense',
    'callLog',
    'discount',
    'paymentPromise',
    'plannedAbsence',
    'scholarship',
    'lessonCancellation',
    'lessonReschedule',
    'lessonTeacherOverride',
    'comment',
    'commentAssignee',
    'employeeSalaryConfig',
    'salaryPayment',
    'mockExamParticipant',
  ];
  for (const model of models) {
    const modelRows = rows[model] ?? [];
    base[model] = {
      count: jest.fn(async ({ where }: any = {}) =>
        modelRows.filter((r) => matchesWhere(r, where)).length,
      ),
    };
  }
  return base;
}

describe('assertBranchIsFinanciallyEmpty', () => {
  it("moliyaviy tarixi yo'q filialdan o'tkazadi", async () => {
    const prisma = fakePrismaWithMoney(namanganish, {});
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).resolves.toBeUndefined();
  });

  it("bitta to'lov ham bo'lsa to'xtatadi", async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      payment: [{ id: 'p-1', studentId: 10795, branchId: 2 }],
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).rejects.toThrow(/Payment: 1/);
  });

  it('topilgan barcha jadvallarni bitta xabarda sanaydi', async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      payment: Array.from({ length: 20 }, (_, i) => ({
        id: `p-${i}`,
        studentId: 10795,
        branchId: 2,
      })),
      transaction: Array.from({ length: 4326 }, (_, i) => ({
        id: `t-${i}`,
        studentId: 10795,
        branchId: 2,
      })),
      attendance: Array.from({ length: 7 }, (_, i) => ({ id: `a-${i}`, groupId: 'g-1' })),
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).rejects.toThrow(
      /Payment: 20[\s\S]*Transaction: 4326[\s\S]*Attendance: 7/,
    );
  });

  it("o'quvchisi ham, guruhi ham yo'q filialdan o'tkazadi", async () => {
    const prisma = fakePrismaWithMoney({ branch: { id: 3, name: 'Bo\'sh', companyId: 1 } }, {});
    const plan = await buildBranchResetPlan(prisma, 3);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).resolves.toBeUndefined();
  });

  it("o'quvchi filialdan chiqarilgan bo'lsa ham, to'lov branchId orqali topilib tutiladi", async () => {
    // #99999 plan.studentIds ichida YO'Q (boshqa filialga o'tkazilgan deb
    // tasavvur qilinadi), lekin to'lovning o'zi shu filial branchId'sini
    // ko'taradi — pul hali ham shu filialga tegishli.
    const prisma = fakePrismaWithMoney(namanganish, {
      payment: [{ id: 'p-stray', studentId: 99999, branchId: 2 }],
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    expect(plan.studentIds).not.toContain(99999);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).rejects.toThrow(/Payment/);
  });

  it("o'quvchi filialdan chiqarilgan bo'lsa ham, shartnoma branchId orqali topilib tutiladi", async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      contract: [{ id: 'c-stray', studentId: 99999, branchId: 2 }],
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    expect(plan.studentIds).not.toContain(99999);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).rejects.toThrow(/Contract/);
  });

  it("o'quvchisi ham, guruhi ham yo'q filialda ham, kassa harakati branchId orqali tutiladi", async () => {
    // Bu tekshiruv "bo'sh filial" yorlig'ini shart tekshiruvining o'zi
    // qoldirmasligini isbotlaydi: studentIds/groupIds bo'sh bo'lsa-da,
    // CashMovement filial ID orqali topiladi va rad javobi beriladi.
    const prisma = fakePrismaWithMoney(
      { branch: { id: 3, name: 'Bo\'sh', companyId: 1 } },
      { cashMovement: [{ id: 'cm-1', branchId: 3 }] },
    );
    const plan = await buildBranchResetPlan(prisma, 3);
    expect(plan.studentIds).toEqual([]);
    expect(plan.groupIds).toEqual([]);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).rejects.toThrow(/CashMovement/);
  });
});

describe('assertNoBlockingDependents', () => {
  it("bog'liq yozuvi yo'q toza rejadan o'tkazadi", async () => {
    const prisma = fakePrismaWithMoney(namanganish, {});
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertNoBlockingDependents(prisma, plan)).resolves.toBeUndefined();
  });

  it('xodim yozgan izohni (Comment.authorId) tutadi', async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      comment: [{ id: 'cm-1', authorId: 10768 }],
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertNoBlockingDependents(prisma, plan)).rejects.toThrow(
      /Comment\.authorId: 1/,
    );
  });

  it('filial guruhidagi davomat yozuvini (Attendance.groupId) tutadi', async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      attendance: [{ id: 'a-1', groupId: 'g-1', studentId: 99999 }],
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertNoBlockingDependents(prisma, plan)).rejects.toThrow(
      /Attendance\.groupId: 1/,
    );
  });

  it('topilgan har bir bloklovchi jadvalni bitta xabarda sanaydi, faqat birinchisini emas', async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      attendance: [{ id: 'a-1', groupId: 'g-1', studentId: 99999 }],
      comment: [{ id: 'cm-1', authorId: 10768 }],
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertNoBlockingDependents(prisma, plan)).rejects.toThrow(
      /Attendance\.groupId: 1[\s\S]*Comment\.authorId: 1/,
    );
  });
});
