import {
  buildBranchResetPlan,
  verifyBranchResetPlan,
  BranchResetUnsafeError,
  BranchResetPlan,
} from './branch-reset-plan';

/**
 * Prisma o'rniga qo'yiladigan soxta mijoz. Faqat reja yig'uvchi va tekshiruvchi
 * chaqiradigan metodlar bor.
 */
function fakePrisma(data: {
  branch?: { id: number; name: string } | null;
  studentBranches?: { studentId: number; branchId: number }[];
  students?: { id: number; userId: number | null }[];
  userBranches?: { userId: number; branchId: number }[];
  groups?: { id: string; branchId: number }[];
  rooms?: { id: string; branchId: number }[];
  courses?: { id: string; branchId: number }[];
  enrollments?: { id: string; groupId: string }[];
  snapshots?: { id: number; branchId: number | null }[];
}) {
  const d = {
    branch: data.branch === undefined ? { id: 2, name: 'Namangan filali' } : data.branch,
    studentBranches: data.studentBranches ?? [],
    students: data.students ?? [],
    userBranches: data.userBranches ?? [],
    groups: data.groups ?? [],
    rooms: data.rooms ?? [],
    courses: data.courses ?? [],
    enrollments: data.enrollments ?? [],
    snapshots: data.snapshots ?? [],
  };
  const inList = (v: unknown, w: any) =>
    w === undefined ? true : Array.isArray(w?.in) ? w.in.includes(v) : v === w;
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
        d.groups.filter((r) => inList(r.branchId, where?.branchId) && inList(r.id, where?.id)),
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
        d.snapshots.filter((r) => inList(r.branchId, where?.branchId)),
      ),
    },
  } as any;
}

/** Namangan'ning haqiqiy shakli: 1 CEO ikkala filialda, 2 xodim faqat bunda. */
const namanganish = {
  branch: { id: 2, name: 'Namangan filali' },
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
});
