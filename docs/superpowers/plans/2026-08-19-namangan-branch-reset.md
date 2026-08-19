# Namangan filialini bo'shatish — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Namangan filiali (`Branch.id = 2`) ichidagi barcha o'quvchi, xodim, guruh, xona va kursni prod'dan qaytarib bo'lmaydigan qilib o'chirish, filialning o'zini va uning bootstrap infratuzilmasini saqlab qolgan holda.

**Architecture:** Mantiq ikkiga bo'linadi. `src/branches/branch-reset-plan.ts` nimani o'chirish kerakligini aniq ID ro'yxatlari sifatida yig'adi va bu ro'yxatlar xavfsizligini tekshiradi; `src/branches/branch-reset-execute.ts` esa shu ro'yxatlarni FK-xavfsiz tartibda bitta tranzaksiyada o'chiradi. Ikkalasi ham `src/` ichida, chunki jest `rootDir` `src` ga qo'yilgan va faqat o'sha yerdagi testlar ishlaydi. `scripts/reset-branch.ts` — ustidagi ingichka CLI qobiq: argument tahlili, dry-run chiqishi, JSON zaxira, tasdiqlash darvozasi.

**Tech Stack:** TypeScript, Prisma 7 (`@prisma/adapter-pg`), NestJS (faqat `PrismaService` tipi uchun), Jest + ts-jest, Railway CLI.

## Global Constraints

- Filial: `Branch.id = 2`, `companyId = 1001`, DB dagi nomi aynan `Namangan filali` (bitta `i` tushib qolgan — tasdiqlash satri shunday yozilishi shart).
- Hech qanday `deleteMany` ochiq `branchId` sharti bilan chaqirilmaydi. Har bir o'chirish tranzaksiya boshida bir marta yig'ilgan aniq ID ro'yxatiga tayanadi.
- CEO Sherali Yodgorov (`User.id = 10562`) va uning `UserBranch(userId=10562, branchId=2)` qatori tegilmaydi.
- `Branch` qatorining o'zi, 2 ta `CashAccount` va `systemKey='NEW'` `LeadColumn` + uning `LeadSection` i saqlanadi. Ular `branches.service.create()` da faqat bir marta quriladi va UI'dan qayta yaratib bo'lmaydi.
- Kod izohlari va CLI chiqishi lotin alifbosidagi o'zbek tilida. Kirill yoki arab harflari ishlatilmaydi.
- Farg'ona filiali (`Branch.id = 1`) ga tegishli bironta qator o'zgarmasligi kerak. Skriptning oldin/keyin sanoq tekshiruvi buni TO'LIQ ISBOTLAMAYDI — u faqat YUQORI CHEGARA (tenglik emas: `$transaction` davomida parallel yozuvlar bo'lishi mumkin), va u SET NULL/CASCADE orqali sodir bo'ladigan, sonni o'zgartirmaydigan mutatsiyalarni (masalan `Contract.groupId` NULL bo'lib qolishi) umuman ko'ra olmaydi. Bunday mutatsiyalarni oldindan yo'qqa chiqarish uchun alohida `assertNoInboundReferences` qorovuli bor (Task 2ga qo'shimcha, quyida) — u reja TASHQARISIDAGI hech bir qator reja ICHIDAGI ID ga ishora qilmasligini tranzaksiya boshlanishidan oldin ham, ichida ham tekshiradi. Filialning o'zi, uning `CashAccount`lari va lid ustuni/bo'limi esa alohida, ANIQ TENGLIK bilan tekshiriladi (`preservedTotals`) — chunki oldin/keyin sanoq bu filialni ATAYLAB chetlab o'tadi.

---

## Fayl tuzilishi

| Fayl | Mas'uliyati |
|---|---|
| `server/src/branches/branch-reset-plan.ts` | Nima o'chishini ID ro'yxatlari sifatida yig'adi; ro'yxatlar boshqa filialga tegib ketmaganini tekshiradi; filialda moliyaviy tarix yo'qligini tekshiradi; dry-run uchun sanoq beradi |
| `server/src/branches/branch-reset-plan.spec.ts` | Yuqoridagining birlik testlari |
| `server/src/branches/branch-reset-execute.ts` | Tayyor rejani FK-xavfsiz tartibda o'chiradi |
| `server/src/branches/branch-reset-execute.spec.ts` | O'chirish tartibi va «hech qachon branchId bo'yicha o'chirmaslik» kafolatining testlari |
| `server/scripts/reset-branch.ts` | CLI: `--branch`, `--dry-run`, `--backup`, `--confirm` |

`branch-reset-*.ts` fayllari hech qanday Nest moduliga ulanmaydi — ular kutubxona kodi, route emas. Loyihada ishlatilmagan eksportni tekshiruvchi vosita (knip / ts-prune) yo'q, shuning uchun bu muammo tug'dirmaydi.

---

## Spec'ga qo'shimcha: moliyaviy qorovul

Spec'da yo'q, lekin Task 2 da qo'shiladigan oltinchi kafolat. Skript filialda **bironta** to'lov, tranzaksiya, davomat, oylik hisoblanmasi, shartnoma, qaytarish, kassa harakati yoki xarajat topsa — ishlashdan bosh tortadi.

Sababi: bu skript koddagi eng xavfli fayl bo'ladi. Namangan hozir bo'sh, lekin kimdir uni keyinroq Farg'onaga qaratsa, moliyaviy tarix jimgina yo'q bo'lib ketishi mumkin. Qorovul buni imkonsiz qiladi va lokal seed DB (unda 2-filialda 20 to'lov va 4326 tranzaksiya bor) uchun tayyor manfiy test beradi.

---

### Task 1: Reset rejasini yig'ish va tekshirish

**Files:**
- Create: `server/src/branches/branch-reset-plan.ts`
- Test: `server/src/branches/branch-reset-plan.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `Prisma.TransactionClient` (mavjud)
- Produces:
  - `interface BranchResetPlan` — quyidagi maydonlar bilan
  - `async function buildBranchResetPlan(prisma: PrismaLike, branchId: number): Promise<BranchResetPlan>`
  - `async function verifyBranchResetPlan(prisma: PrismaLike, plan: BranchResetPlan): Promise<void>` — xavfsiz bo'lmasa `BranchResetUnsafeError` tashlaydi
  - `class BranchResetUnsafeError extends Error`

- [ ] **Step 1: Write the failing test**

`server/src/branches/branch-reset-plan.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/branches/branch-reset-plan.spec.ts`
Expected: FAIL — `Cannot find module './branch-reset-plan'`

- [ ] **Step 3: Write minimal implementation**

`server/src/branches/branch-reset-plan.ts`:

```ts
/**
 * Filialni bo'shatish rejasi — nima o'chishi va bu xavfsizmi.
 *
 * Namangan (#2) go-live'dan oldin seed ma'lumot bilan to'ldirilgan va noldan
 * qayta ochish uchun tozalanishi kerak bo'ldi. Bu modul o'chirishning O'ZINI
 * qilmaydi: u aniq ID ro'yxatlarini yig'adi, `branch-reset-execute.ts` esa
 * faqat shu ro'yxatlarga tayanadi.
 *
 * Nega ochiq `WHERE branchId = ?` emas. O'chirish qaytarib bo'lmaydi va
 * noto'g'ri yozilgan bitta shart butun filialni yo'q qilishi mumkin. Ro'yxat
 * esa yig'ilgandan keyin `verifyBranchResetPlan` bilan qayta so'raladi: har bir
 * ID chindan ham shu filialga tegishli ekani ikkinchi marta, mustaqil ravishda
 * tasdiqlanadi.
 */
import { Prisma, PrismaClient } from '@prisma/client';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/** Tekshiruvdan o'tmagan reja. Chiqishi — tranzaksiya bekor bo'lishi. */
export class BranchResetUnsafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BranchResetUnsafeError';
  }
}

export interface BranchResetPlan {
  branchId: number;
  branchName: string;
  /** Shu filialga biriktirilgan o'quvchilar. */
  studentIds: number[];
  /** Ularning login akkauntlari (`Student.userId`), null bo'lganlari tushadi. */
  studentUserIds: number[];
  /** Filial xodimlari — bir nechta filialda turganlari CHIQARIB TASHLANGAN. */
  staffUserIds: number[];
  /** Ataylab saqlangan ko'p filialli foydalanuvchilar (hozircha faqat CEO). */
  keptUserIds: number[];
  enrollmentIds: string[];
  groupIds: string[];
  roomIds: string[];
  courseIds: string[];
  snapshotIds: number[];
}

export async function buildBranchResetPlan(
  prisma: PrismaLike,
  branchId: number,
): Promise<BranchResetPlan> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true },
  });
  if (!branch) {
    throw new BranchResetUnsafeError(`Filial #${branchId} topilmadi`);
  }

  const studentLinks = await prisma.studentBranch.findMany({
    where: { branchId },
    select: { studentId: true },
  });
  const studentIds = studentLinks.map((r) => r.studentId);

  const students = studentIds.length
    ? await prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, userId: true },
      })
    : [];
  const studentUserIds = students
    .map((s) => s.userId)
    .filter((id): id is number => id != null);

  // Xodimlar. Bir nechta filialda turgan har qanday foydalanuvchi chiqarib
  // tashlanadi — bu qoida CEO uchun yozilmagan, umumiy: agar odam boshqa
  // filialda ham ishlayotgan bo'lsa, uni o'chirish o'sha filialni ham buzadi.
  const branchStaff = await prisma.userBranch.findMany({
    where: { branchId },
    select: { userId: true },
  });
  const candidateIds = branchStaff.map((r) => r.userId);
  const allLinksOfCandidates = candidateIds.length
    ? await prisma.userBranch.findMany({
        where: { userId: { in: candidateIds } },
        select: { userId: true, branchId: true },
      })
    : [];
  const linkCount = new Map<number, number>();
  for (const link of allLinksOfCandidates) {
    linkCount.set(link.userId, (linkCount.get(link.userId) ?? 0) + 1);
  }
  const staffUserIds = candidateIds.filter((id) => (linkCount.get(id) ?? 0) <= 1);
  const keptUserIds = candidateIds.filter((id) => (linkCount.get(id) ?? 0) > 1);

  const groups = await prisma.group.findMany({
    where: { branchId },
    select: { id: true },
  });
  const groupIds = groups.map((g) => g.id);

  const enrollments = groupIds.length
    ? await prisma.enrollment.findMany({
        where: { groupId: { in: groupIds } },
        select: { id: true },
      })
    : [];

  const rooms = await prisma.room.findMany({ where: { branchId }, select: { id: true } });
  const courses = await prisma.course.findMany({ where: { branchId }, select: { id: true } });
  const snapshots = await prisma.dailyFinancialSnapshot.findMany({
    where: { branchId },
    select: { id: true },
  });

  return {
    branchId,
    branchName: branch.name,
    studentIds,
    studentUserIds,
    staffUserIds,
    keptUserIds,
    enrollmentIds: enrollments.map((e) => e.id),
    groupIds,
    roomIds: rooms.map((r) => r.id),
    courseIds: courses.map((c) => c.id),
    snapshotIds: snapshots.map((s) => s.id),
  };
}

/**
 * Rejani mustaqil ravishda qayta so'rab tekshiradi. `buildBranchResetPlan`
 * to'g'ri ishlaganiga ishonmaydi: har bir ID to'plami DB dan yana bir bor
 * o'qiladi va boshqa filialga tegishli bironta qator yo'qligi tasdiqlanadi.
 */
export async function verifyBranchResetPlan(
  prisma: PrismaLike,
  plan: BranchResetPlan,
): Promise<void> {
  const problems: string[] = [];

  if (plan.studentIds.length) {
    const strays = await prisma.studentBranch.findMany({
      where: { studentId: { in: plan.studentIds } },
      select: { studentId: true, branchId: true },
    });
    for (const s of strays) {
      if (s.branchId !== plan.branchId) {
        problems.push(`O'quvchi #${s.studentId} #${s.branchId} filialda ham turibdi`);
      }
    }
  }

  if (plan.staffUserIds.length) {
    const strays = await prisma.userBranch.findMany({
      where: { userId: { in: plan.staffUserIds } },
      select: { userId: true, branchId: true },
    });
    for (const u of strays) {
      if (u.branchId !== plan.branchId) {
        problems.push(`Xodim #${u.userId} #${u.branchId} filialda ham turibdi`);
      }
    }
  }

  const scoped: [string, string[], () => Promise<{ id: string; branchId: number | null }[]>][] = [
    [
      'Guruh',
      plan.groupIds,
      () =>
        prisma.group.findMany({
          where: { id: { in: plan.groupIds } },
          select: { id: true, branchId: true },
        }),
    ],
    [
      'Xona',
      plan.roomIds,
      () =>
        prisma.room.findMany({
          where: { id: { in: plan.roomIds } },
          select: { id: true, branchId: true },
        }),
    ],
    [
      'Kurs',
      plan.courseIds,
      () =>
        prisma.course.findMany({
          where: { id: { in: plan.courseIds } },
          select: { id: true, branchId: true },
        }),
    ],
  ];
  for (const [label, ids, query] of scoped) {
    if (!ids.length) continue;
    for (const row of await query()) {
      if (row.branchId !== plan.branchId) {
        problems.push(`${label} ${row.id} #${row.branchId} filialga tegishli`);
      }
    }
  }

  if (problems.length) {
    throw new BranchResetUnsafeError(
      `Reja xavfsiz emas, o'chirish bekor qilindi:\n  - ${problems.join('\n  - ')}`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/branches/branch-reset-plan.spec.ts`
Expected: PASS — 8 test

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/branches/branch-reset-plan.ts server/src/branches/branch-reset-plan.spec.ts
git commit -m "Collect a branch reset as explicit id lists, then re-check them

An open WHERE branchId = ? is one typo away from emptying the wrong branch,
so the plan is gathered once as concrete id lists and every list is then
re-queried independently to prove it belongs to the branch being reset.

Anyone attached to more than one branch drops out of the delete list. That
rule is not written for the CEO in particular: deleting a user who also works
in another branch breaks that branch too."
```

---

### Task 2: Moliyaviy qorovul

**Files:**
- Modify: `server/src/branches/branch-reset-plan.ts`
- Test: `server/src/branches/branch-reset-plan.spec.ts`

**Interfaces:**
- Consumes: `BranchResetPlan`, `BranchResetUnsafeError` (Task 1)
- Produces: `async function assertBranchIsFinanciallyEmpty(prisma: PrismaLike, plan: BranchResetPlan): Promise<void>`

- [ ] **Step 1: Write the failing test**

`server/src/branches/branch-reset-plan.spec.ts` faylining oxiriga qo'shing, va yuqoridagi `fakePrisma` ga moliyaviy jadval sanoqlarini qo'shing:

```ts
/**
 * fakePrisma ga qo'shimcha: moliyaviy jadval sanoqlari. Ko'rsatilmagan jadval
 * 0 deb hisoblanadi.
 */
function fakePrismaWithMoney(
  data: Parameters<typeof fakePrisma>[0],
  counts: Record<string, number>,
) {
  const base = fakePrisma(data);
  for (const model of [
    'payment',
    'transaction',
    'attendance',
    'salaryAccrual',
    'contract',
    'refund',
    'cashMovement',
    'expense',
  ]) {
    base[model] = { count: jest.fn(async () => counts[model] ?? 0) };
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
    const prisma = fakePrismaWithMoney(namanganish, { payment: 1 });
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).rejects.toThrow(/Payment: 1/);
  });

  it('topilgan barcha jadvallarni bitta xabarda sanaydi', async () => {
    const prisma = fakePrismaWithMoney(namanganish, {
      payment: 20,
      transaction: 4326,
      attendance: 7,
    });
    const plan = await buildBranchResetPlan(prisma, 2);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).rejects.toThrow(
      /Payment: 20[\s\S]*Transaction: 4326[\s\S]*Attendance: 7/,
    );
  });

  it("o'quvchisi ham, guruhi ham yo'q filialdan o'tkazadi", async () => {
    const prisma = fakePrismaWithMoney({ branch: { id: 3, name: 'Bo\'sh' } }, {});
    const plan = await buildBranchResetPlan(prisma, 3);
    await expect(assertBranchIsFinanciallyEmpty(prisma, plan)).resolves.toBeUndefined();
  });
});
```

`import` satriga `assertBranchIsFinanciallyEmpty` ni qo'shing.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/branches/branch-reset-plan.spec.ts`
Expected: FAIL — `assertBranchIsFinanciallyEmpty is not a function`

- [ ] **Step 3: Write minimal implementation**

`server/src/branches/branch-reset-plan.ts` oxiriga qo'shing:

```ts
/**
 * Filialda pul tarixi yo'qligini tekshiradi.
 *
 * Bu fayl repozitoriyadagi eng xavfli kod bo'ladi: u tiklab bo'lmaydigan
 * o'chirishni bajaradi. Namangan hozir bo'sh, lekin skript qoladi va kimdir
 * uni keyinroq boshqa filialga qaratishi mumkin. Qorovul buni imkonsiz qiladi:
 * bironta to'lov, tranzaksiya, davomat, oylik hisoblanmasi, shartnoma,
 * qaytarish, kassa harakati yoki xarajat topilsa — skript umuman ishlamaydi.
 *
 * Bunday filialni tozalash kerak bo'lsa, bu qorovulni chetlab o'tish emas,
 * moliyaviy tarixni nima qilish kerakligi haqida alohida qaror kerak.
 */
export async function assertBranchIsFinanciallyEmpty(
  prisma: PrismaLike,
  plan: BranchResetPlan,
): Promise<void> {
  const { studentIds, groupIds, branchId } = plan;
  const noStudents = studentIds.length === 0;
  const noGroups = groupIds.length === 0;

  const checks: [string, () => Promise<number>][] = [
    ['Payment', () => (noStudents ? 0 : prisma.payment.count({ where: { studentId: { in: studentIds } } }))],
    ['Transaction', () => (noStudents ? 0 : prisma.transaction.count({ where: { studentId: { in: studentIds } } }))],
    ['Attendance', () => (noGroups ? 0 : prisma.attendance.count({ where: { groupId: { in: groupIds } } }))],
    ['SalaryAccrual', () => (noGroups ? 0 : prisma.salaryAccrual.count({ where: { groupId: { in: groupIds } } }))],
    ['Contract', () => (noStudents ? 0 : prisma.contract.count({ where: { studentId: { in: studentIds } } }))],
    ['Refund', () => (noStudents ? 0 : prisma.refund.count({ where: { studentId: { in: studentIds } } }))],
    ['CashMovement', () => prisma.cashMovement.count({ where: { branchId } })],
    ['Expense', () => prisma.expense.count({ where: { branchId } })],
  ];

  const found: string[] = [];
  for (const [label, run] of checks) {
    const count = await run();
    if (count > 0) found.push(`${label}: ${count}`);
  }

  if (found.length) {
    throw new BranchResetUnsafeError(
      `Filial #${branchId} (${plan.branchName}) da moliyaviy tarix bor, ` +
        `bo'shatish rad etildi:\n  - ${found.join('\n  - ')}`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/branches/branch-reset-plan.spec.ts`
Expected: PASS — 12 test

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/branches/branch-reset-plan.ts server/src/branches/branch-reset-plan.spec.ts
git commit -m "Refuse to empty a branch that has any money behind it

Namangan is empty today, but the script outlives the job it was written for
and the next person to reach for it may aim it at a branch that is not. One
payment, transaction, attendance row, accrual, contract, refund, cash movement
or expense and it will not run at all."
```

---

### Task 3: O'chirishni bajarish

**Files:**
- Create: `server/src/branches/branch-reset-execute.ts`
- Test: `server/src/branches/branch-reset-execute.spec.ts`

**Interfaces:**
- Consumes: `BranchResetPlan` (Task 1)
- Produces: `async function executeBranchReset(tx: Prisma.TransactionClient, plan: BranchResetPlan): Promise<Record<string, number>>` — kalit: jadval nomi, qiymat: o'chirilgan qatorlar soni

- [ ] **Step 1: Write the failing test**

`server/src/branches/branch-reset-execute.spec.ts`:

```ts
import { executeBranchReset } from './branch-reset-execute';
import { BranchResetPlan } from './branch-reset-plan';

const PLAN: BranchResetPlan = {
  branchId: 2,
  branchName: 'Namangan filali',
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

  it("filial qatorini, kassani va lid ustunini umuman tegmaydi", async () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/branches/branch-reset-execute.spec.ts`
Expected: FAIL — `Cannot find module './branch-reset-execute'`

- [ ] **Step 3: Write minimal implementation**

`server/src/branches/branch-reset-execute.ts`:

```ts
/**
 * Tekshiruvdan o'tgan `BranchResetPlan` ni bajaradi.
 *
 * Chaqiruvchi buni `$transaction` ichida ishlatishi shart: yarim o'chgan filial
 * — RESTRICT bog'liqliklari uzilgan, lekin ota-qatorlari qolgan holat — hech
 * qanday ekranga to'g'ri ko'rinmaydi.
 *
 * Tartib FK yo'nalishiga qarab: RESTRICT bilan bog'langan bola avval, ota
 * keyin. CASCADE bilan bog'langanlar avtomatik ketardi, lekin ular ham aniq
 * yozilgan — o'chirilgan qatorlar soni chiqishda ko'rinishi uchun.
 *
 * `Branch`, `CashAccount`, `LeadColumn` va `LeadSection` ATAYLAB yo'q. Kassa
 * hisoblari va systemKey='NEW' lid ustuni faqat `branches.service.create()`
 * ichida, filial tug'ilganda quriladi — ularni UI'dan qayta yaratib bo'lmaydi.
 * Kassasiz filial umuman pul qabul qila olmaydi (`resolveAccountId` xato
 * tashlaydi), ustunsiz filialning /leads sahifasi esa boshi berk ko'cha.
 */
import { Prisma } from '@prisma/client';
import { BranchResetPlan } from './branch-reset-plan';

export async function executeBranchReset(
  tx: Prisma.TransactionClient,
  plan: BranchResetPlan,
): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};

  const wipe = async (model: string, ids: unknown[], where: any) => {
    if (!ids.length) return;
    const result = await (tx as any)[model].deleteMany({ where });
    deleted[model] = (deleted[model] ?? 0) + result.count;
  };

  const {
    studentIds,
    studentUserIds,
    staffUserIds,
    enrollmentIds,
    groupIds,
    roomIds,
    courseIds,
    snapshotIds,
  } = plan;

  // ── 1-qadam: o'quvchi tomoni ────────────────────────────────────────────
  // SmsMessage.studentId RESTRICT — o'quvchidan oldin ketishi SHART.
  await wipe('smsMessage', studentIds, { studentId: { in: studentIds } });
  await wipe('enrollmentStateLog', enrollmentIds, { enrollmentId: { in: enrollmentIds } });
  await wipe('enrollment', enrollmentIds, { id: { in: enrollmentIds } });
  await wipe('studentBranch', studentIds, { studentId: { in: studentIds } });
  await wipe('student', studentIds, { id: { in: studentIds } });

  // O'quvchilarning login akkauntlari. Student.userId User ga ishora qiladi,
  // shuning uchun Student allaqachon ketgan bo'lishi kerak.
  await wipe('notification', studentUserIds, { userId: { in: studentUserIds } });
  await wipe('userRole', studentUserIds, { userId: { in: studentUserIds } });

  // ── 2-qadam: guruh, xona, kurs ──────────────────────────────────────────
  await wipe('groupScheduleSnapshot', groupIds, { groupId: { in: groupIds } });
  await wipe('groupHolidayExtension', groupIds, { groupId: { in: groupIds } });
  await wipe('groupTeacherHistory', groupIds, { groupId: { in: groupIds } });
  await wipe('groupTeacher', groupIds, { groupId: { in: groupIds } });
  await wipe('group', groupIds, { id: { in: groupIds } });

  // Group.roomId va Group.courseId ishora qiladi, demak guruhdan keyin.
  await wipe('roomCapacitySnapshot', roomIds, { roomId: { in: roomIds } });
  await wipe('room', roomIds, { id: { in: roomIds } });
  await wipe('coursePriceSnapshot', courseIds, { courseId: { in: courseIds } });
  await wipe('course', courseIds, { id: { in: courseIds } });

  // ── 3-qadam: xodimlar ───────────────────────────────────────────────────
  // Notification.userId RESTRICT — foydalanuvchidan oldin ketishi SHART.
  await wipe('notification', staffUserIds, { userId: { in: staffUserIds } });
  await wipe('userRole', staffUserIds, { userId: { in: staffUserIds } });
  await wipe('userBranch', staffUserIds, { userId: { in: staffUserIds } });

  const allUserIds = [...studentUserIds, ...staffUserIds];
  await wipe('user', allUserIds, { id: { in: allUserIds } });

  // ── 4-qadam: audit izlari ───────────────────────────────────────────────
  // entityId — oddiy matn ustuni, FK emas: o'chirilgan yozuvga ishora qiluvchi
  // qatorlar o'zidan-o'zi ketmaydi va yangi filial ID lari bilan aralashadi.
  const historyWhere = {
    OR: [
      { entityType: 'Student', entityId: { in: studentIds.map(String) } },
      { entityType: 'Enrollment', entityId: { in: enrollmentIds } },
      { entityType: 'Group', entityId: { in: groupIds } },
      { entityType: 'Room', entityId: { in: roomIds } },
      { entityType: 'Course', entityId: { in: courseIds } },
      { entityType: 'User', entityId: { in: allUserIds.map(String) } },
    ],
  };
  const historyIds = [
    ...studentIds,
    ...enrollmentIds,
    ...groupIds,
    ...roomIds,
    ...courseIds,
    ...allUserIds,
  ];
  await wipe('entityHistory', historyIds, historyWhere);
  await wipe('statusHistory', historyIds, historyWhere);

  // ── 5-qadam: kunlik moliyaviy suratlar ──────────────────────────────────
  await wipe('dailyFinancialSnapshot', snapshotIds, { id: { in: snapshotIds } });

  return deleted;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/branches/branch-reset-execute.spec.ts`
Expected: PASS — 5 test

- [ ] **Step 5: Butun test to'plamini yiqilmaganini tekshirish**

Run: `cd server && npx jest src/branches`
Expected: PASS — barcha `src/branches` testlari

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/branches/branch-reset-execute.ts server/src/branches/branch-reset-execute.spec.ts
git commit -m "Delete a branch's contents child-first, by id, inside one transaction

SmsMessage and Notification are the two RESTRICT edges that make the naive
order fail, and Student points at User rather than the other way round, so
the accounts go last.

Branch, CashAccount, LeadColumn and LeadSection are deliberately absent: they
are built once inside branches.service.create() and there is no UI path back.
A branch without a cash account takes no money at all."
```

---

### Task 4: CLI skript

**Files:**
- Create: `server/scripts/reset-branch.ts`

**Interfaces:**
- Consumes: `buildBranchResetPlan`, `verifyBranchResetPlan`, `assertBranchIsFinanciallyEmpty` (Task 1–2), `executeBranchReset` (Task 3), `makePrisma`/`printHeader`/`section`/`printTable` (`scripts/lib/check-cli.ts`)
- Produces: CLI, boshqa kod uchun eksport yo'q

- [ ] **Step 1: Write the script**

`server/scripts/reset-branch.ts`:

```ts
/**
 * reset-branch — filialni bo'shatadi: barcha o'quvchi, xodim, guruh, xona va
 * kursni QAYTARIB BO'LMAYDIGAN qilib o'chiradi. Filialning o'zi, kassa
 * hisoblari va lid ustuni qoladi, ya'ni filial keyin qaytadan to'ldirilishi
 * mumkin.
 *
 * Usage:
 *   npx ts-node scripts/reset-branch.ts --branch=2                          (dry-run)
 *   npx ts-node scripts/reset-branch.ts --branch=2 --backup                 (dry-run + zaxira)
 *   npx ts-node scripts/reset-branch.ts --branch=2 --backup --confirm="Namangan filali"
 *
 * Prod uchun oldiga `railway run` qo'shing.
 *
 * `--confirm` qiymati DB dagi filial nomiga AYNAN mos kelishi kerak. Bu
 * `--branch=1` deb xato yozib qo'yishdan himoya qiladi: noto'g'ri raqam bilan
 * nom mos kelmaydi va skript to'xtaydi.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  buildBranchResetPlan,
  verifyBranchResetPlan,
  assertBranchIsFinanciallyEmpty,
  BranchResetPlan,
} from '../src/branches/branch-reset-plan';
import { executeBranchReset } from '../src/branches/branch-reset-execute';
import { makePrisma, printHeader, section, printTable, dbEnvLabel } from './lib/check-cli';

interface Args {
  branchId: number;
  backup: boolean;
  confirm: string | null;
}

function parse(): Args {
  const argv = process.argv.slice(2);
  const value = (name: string) => {
    const token = argv.find((a) => a.startsWith(`--${name}=`));
    return token ? token.slice(name.length + 3) : null;
  };
  const branch = value('branch');
  if (!branch || !Number.isInteger(Number(branch))) {
    console.error("--branch=<id> kerak. Masalan: --branch=2");
    process.exit(1);
  }
  return {
    branchId: Number(branch),
    backup: argv.includes('--backup'),
    confirm: value('confirm'),
  };
}

/**
 * Boshqa filiallarning jadval sanoqlari. O'chishdan oldin va keyin olinadi;
 * farq bo'lsa — o'chirish o'z doirasidan chiqib ketgan.
 */
async function otherBranchTotals(
  prisma: PrismaClient,
  excludeBranchId: number,
): Promise<Record<string, number>> {
  const not = { not: excludeBranchId };
  const otherStudentIds = (
    await prisma.studentBranch.findMany({
      where: { branchId: not },
      select: { studentId: true },
    })
  ).map((r) => r.studentId);
  const otherGroupIds = (
    await prisma.group.findMany({ where: { branchId: not }, select: { id: true } })
  ).map((g) => g.id);

  return {
    students: otherStudentIds.length,
    groups: otherGroupIds.length,
    rooms: await prisma.room.count({ where: { branchId: not } }),
    courses: await prisma.course.count({ where: { branchId: not } }),
    staffLinks: await prisma.userBranch.count({ where: { branchId: not } }),
    users: await prisma.user.count(),
    enrollments: otherGroupIds.length
      ? await prisma.enrollment.count({ where: { groupId: { in: otherGroupIds } } })
      : 0,
    payments: await prisma.payment.count(),
    transactions: await prisma.transaction.count(),
    attendances: await prisma.attendance.count(),
    salaryAccruals: await prisma.salaryAccrual.count(),
    cashAccounts: await prisma.cashAccount.count(),
    leadColumns: await prisma.leadColumn.count(),
    entityHistory: await prisma.entityHistory.count(),
  };
}

/** O'chishdan oldin barcha qatorlarni JSON qilib yozadi. */
async function writeBackup(prisma: PrismaClient, plan: BranchResetPlan): Promise<string> {
  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `branch-${plan.branchId}-reset-${stamp}.json`);

  const { studentIds, studentUserIds, staffUserIds, groupIds, roomIds, courseIds, enrollmentIds } =
    plan;
  const allUserIds = [...studentUserIds, ...staffUserIds];

  const payload = {
    takenAt: new Date().toISOString(),
    env: dbEnvLabel(),
    plan,
    rows: {
      branch: await prisma.branch.findUnique({ where: { id: plan.branchId } }),
      students: studentIds.length
        ? await prisma.student.findMany({ where: { id: { in: studentIds } } })
        : [],
      users: allUserIds.length
        ? await prisma.user.findMany({ where: { id: { in: allUserIds } } })
        : [],
      userRoles: allUserIds.length
        ? await prisma.userRole.findMany({ where: { userId: { in: allUserIds } } })
        : [],
      userBranches: staffUserIds.length
        ? await prisma.userBranch.findMany({ where: { userId: { in: staffUserIds } } })
        : [],
      enrollments: enrollmentIds.length
        ? await prisma.enrollment.findMany({ where: { id: { in: enrollmentIds } } })
        : [],
      groups: groupIds.length
        ? await prisma.group.findMany({ where: { id: { in: groupIds } } })
        : [],
      rooms: roomIds.length ? await prisma.room.findMany({ where: { id: { in: roomIds } } }) : [],
      courses: courseIds.length
        ? await prisma.course.findMany({ where: { id: { in: courseIds } } })
        : [],
      smsMessages: studentIds.length
        ? await prisma.smsMessage.findMany({ where: { studentId: { in: studentIds } } })
        : [],
      snapshots: plan.snapshotIds.length
        ? await prisma.dailyFinancialSnapshot.findMany({ where: { id: { in: plan.snapshotIds } } })
        : [],
    },
  };

  fs.writeFileSync(
    file,
    JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1),
  );
  return file;
}

async function main() {
  const args = parse();
  const prisma = makePrisma();

  try {
    printHeader(`Filialni bo'shatish — #${args.branchId}`);

    const plan = await buildBranchResetPlan(prisma, args.branchId);
    await verifyBranchResetPlan(prisma, plan);
    await assertBranchIsFinanciallyEmpty(prisma, plan);

    section(`Filial: ${plan.branchName} (#${plan.branchId})`);
    printTable(
      ["O'chadigan", 'Soni'],
      [
        ["O'quvchi", plan.studentIds.length],
        ["O'quvchi akkaunti", plan.studentUserIds.length],
        ['Xodim', plan.staffUserIds.length],
        ['Enrollment', plan.enrollmentIds.length],
        ['Guruh', plan.groupIds.length],
        ['Xona', plan.roomIds.length],
        ['Kurs', plan.courseIds.length],
        ['Kunlik surat', plan.snapshotIds.length],
      ],
      ['l', 'r'],
    );

    section('Saqlanadi');
    console.log('  Filial qatorining o\'zi, kassa hisoblari, lid ustuni va bo\'limi');
    if (plan.keptUserIds.length) {
      console.log(`  Bir nechta filialda turgan foydalanuvchilar: ${plan.keptUserIds.join(', ')}`);
    }

    if (args.backup) {
      const file = await writeBackup(prisma, plan);
      section('Zaxira');
      console.log(`  ${file}`);
    }

    if (args.confirm === null) {
      section('DRY-RUN');
      console.log("  Hech nima o'chirilmadi.");
      console.log(
        `  Haqiqiy o'chirish uchun: --branch=${plan.branchId} --backup --confirm="${plan.branchName}"`,
      );
      return;
    }

    if (args.confirm !== plan.branchName) {
      console.error(
        `\n  --confirm nomi mos kelmadi.\n  Kutilgan: "${plan.branchName}"\n  Berilgan: "${args.confirm}"`,
      );
      process.exitCode = 1;
      return;
    }

    const before = await otherBranchTotals(prisma, plan.branchId);

    section("O'chirilmoqda");
    const deleted = await prisma.$transaction(
      async (tx) => {
        // Reja tranzaksiya ICHIDA qayta yig'iladi va qayta tekshiriladi:
        // dry-run bilan tasdiqlash orasida ma'lumot o'zgargan bo'lishi mumkin.
        const fresh = await buildBranchResetPlan(tx, plan.branchId);
        await verifyBranchResetPlan(tx, fresh);
        await assertBranchIsFinanciallyEmpty(tx, fresh);
        return executeBranchReset(tx, fresh);
      },
      { timeout: 120_000 },
    );

    printTable(
      ['Jadval', "O'chirildi"],
      Object.entries(deleted).map(([k, v]) => [k, v]),
      ['l', 'r'],
    );

    const after = await otherBranchTotals(prisma, plan.branchId);
    section('Boshqa filiallar — oldin / keyin');
    const drift: string[] = [];
    printTable(
      ['Nima', 'Oldin', 'Keyin', 'Farq'],
      Object.keys(before).map((k) => {
        const diff = after[k] - before[k];
        // Foydalanuvchi va audit sanoqlari kompaniya bo'yicha olinadi, shuning
        // uchun ular tushishi KUTILADI — bu filial xodimlari o'chdi degani.
        if (diff !== 0 && !['users', 'entityHistory'].includes(k)) drift.push(k);
        return [k, before[k], after[k], diff === 0 ? '—' : diff];
      }),
      ['l', 'r', 'r', 'r'],
    );

    if (drift.length) {
      console.error(`\n  DIQQAT: boshqa filial ma'lumoti o'zgardi: ${drift.join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log("\n  Boshqa filiallarning ma'lumoti o'zgarmadi.");
    }
  } catch (e) {
    console.error(e instanceof Error ? `\n${e.name}: ${e.message}` : e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
```

- [ ] **Step 2: Tiplar to'g'riligini tekshirish**

Run: `cd server && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "branch-reset|reset-branch" || echo "reset kodida tip xatosi yo'q"`
Expected: `reset kodida tip xatosi yo'q`

- [ ] **Step 3: Zaxira papkasini gitignore qilish**

`.gitignore` ga (repozitoriya ildizida, `server/*.xlsx` satridan keyin) qo'shing:

```
server/scripts/backups/
```

- [ ] **Step 4: Lokal DB da dry-run — moliyaviy qorovul ishlashini ko'rish**

Lokal seed DB ning 2-filialida 20 to'lov va 4326 tranzaksiya bor, demak qorovul to'xtatishi SHART.

Run: `cd server && npx ts-node scripts/reset-branch.ts --branch=2`
Expected: `BranchResetUnsafeError: Filial #2 (Samarqand filiali) da moliyaviy tarix bor, bo'shatish rad etildi:` va ro'yxatda `Payment: 20`, `Transaction: 4326`. Exit code 1.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/scripts/reset-branch.ts .gitignore
git commit -m "Add the reset-branch CLI: dry-run by default, name-matched confirm

--confirm takes the branch NAME, not a yes. Typing --branch=1 by mistake then
fails on the name check instead of emptying Fargona.

The plan is rebuilt and re-verified inside the transaction rather than reusing
the one the dry-run printed, since data can move between looking and deleting."
```

---

### Task 5: Lokal DB da to'liq repetitsiya

**Files:**
- Create: `server/scripts/_fixture-throwaway-branch.ts` (vaqtinchalik, `_` prefiksi tufayli gitignore qilingan)

**Interfaces:**
- Consumes: Task 1–4 dagi hamma narsa
- Produces: hech narsa — bu tekshiruv vazifasi

- [ ] **Step 1: Bir martalik filial fixture'ini yozish**

`server/scripts/_fixture-throwaway-branch.ts`:

```ts
/**
 * Lokal DB da reset-branch uchun bir martalik sinov filiali quradi: Namangan
 * bilan bir xil shakl (o'quvchi + akkaunt + guruh + xona + kurs + xodim),
 * lekin moliyaviy tarixsiz. Faqat DEV da ishlaydi.
 */
import { makePrisma } from './lib/check-cli';

const COMPANY_ID = 1001;

async function main() {
  if (process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT) {
    console.error('Bu fixture faqat lokal DB uchun. railway run bilan ishlatmang.');
    process.exit(1);
  }
  const prisma = makePrisma();

  const branch = await prisma.branch.create({
    data: { name: 'Sinov filiali', companyId: COMPANY_ID },
  });
  const course = await prisma.course.create({
    data: { name: 'Sinov kursi', price: 100000, branchId: branch.id, companyId: COMPANY_ID },
  });
  const room = await prisma.room.create({
    data: { name: 'Sinov xonasi', branchId: branch.id, companyId: COMPANY_ID },
  });
  const group = await prisma.group.create({
    data: {
      name: 'S-001',
      branchId: branch.id,
      courseId: course.id,
      roomId: room.id,
      companyId: COMPANY_ID,
    },
  });

  for (let i = 0; i < 3; i++) {
    const user = await prisma.user.create({
      data: { firstName: `Sinov${i}`, lastName: "O'quvchi", companyId: COMPANY_ID },
    });
    const student = await prisma.student.create({
      data: {
        firstName: `Sinov${i}`,
        lastName: "O'quvchi",
        phone: `9990000${i}`,
        userId: user.id,
        companyId: COMPANY_ID,
        branches: { create: { branchId: branch.id } },
      },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, groupId: group.id },
    });
    // SmsMessage.studentId RESTRICT — o'chirish tartibini sinaydigan qator.
    await prisma.smsMessage.create({
      data: { studentId: student.id, content: 'sinov', type: 'MANUAL', status: 'FAILED' },
    });
  }

  const staff = await prisma.user.create({
    data: {
      firstName: 'Sinov',
      lastName: 'Ustoz',
      companyId: COMPANY_ID,
      branches: { create: { branchId: branch.id } },
    },
  });
  // Notification.userId RESTRICT — ikkinchi tartib sinovi.
  await prisma.notification.create({
    data: {
      userId: staff.id,
      type: 'COMMENT',
      title: 'sinov',
      message: 'sinov',
      companyId: COMPANY_ID,
    },
  });

  console.log(`Sinov filiali yaratildi: #${branch.id} "${branch.name}"`);
  console.log(`  3 o'quvchi + 3 akkaunt, 1 guruh, 1 xona, 1 kurs, 1 xodim`);
  await prisma.$disconnect();
}

void main();
```

- [ ] **Step 2: Fixture'ni ishga tushirish**

Run: `cd server && npx ts-node scripts/_fixture-throwaway-branch.ts`
Expected: `Sinov filiali yaratildi: #<id> "Sinov filiali"` — chiqqan `<id>` ni keyingi qadamlarda ishlating.

- [ ] **Step 3: Dry-run**

Run: `cd server && npx ts-node scripts/reset-branch.ts --branch=<id>`
Expected: Jadvalda `O'quvchi 3`, `O'quvchi akkaunti 3`, `Xodim 1`, `Enrollment 3`, `Guruh 1`, `Xona 1`, `Kurs 1`. Oxirida `DRY-RUN` va `Hech nima o'chirilmadi.`

- [ ] **Step 4: Noto'g'ri tasdiqlash nomi rad etilishini tekshirish**

Run: `cd server && npx ts-node scripts/reset-branch.ts --branch=<id> --confirm="Boshqa nom"`
Expected: `--confirm nomi mos kelmadi.` va exit code 1. Hech nima o'chmaydi.

- [ ] **Step 5: To'liq ishga tushirish**

Run: `cd server && npx ts-node scripts/reset-branch.ts --branch=<id> --backup --confirm="Sinov filiali"`
Expected:
- `Zaxira` bo'limida JSON fayl yo'li
- `O'chirilmoqda` jadvalida `student 3`, `user 4`, `smsMessage 3`, `enrollment 3`, `group 1`, `room 1`, `course 1`, `notification 1`
- `Boshqa filiallarning ma'lumoti o'zgarmadi.`
- Exit code 0

- [ ] **Step 6: Ikkinchi marta ishga tushirish xavfsizligini tekshirish (idempotentlik)**

Run: `cd server && npx ts-node scripts/reset-branch.ts --branch=<id> --confirm="Sinov filiali"`
Expected: Barcha sanoqlar 0, xato yo'q, `Boshqa filiallarning ma'lumoti o'zgarmadi.`

- [ ] **Step 7: Filial va uning kassasi qolganini tekshirish**

`ts-node -e` nisbiy `import` larni ishonchli hal qilmaydi, shuning uchun tekshiruv vaqtinchalik faylga yoziladi.

Run (`<id>` ni Step 2 dagi raqamga almashtiring):
```bash
cd /Users/a1111/Desktop/daf-erp-system/server && cat > scripts/_verify-reset.ts <<'EOF'
import { makePrisma } from './lib/check-cli';
const p = makePrisma();
const id = Number(process.argv[2]);
(async () => {
  console.log('branch:', await p.branch.findUnique({ where: { id } }));
  console.log('students:', await p.studentBranch.count({ where: { branchId: id } }));
  console.log('groups:', await p.group.count({ where: { branchId: id } }));
  console.log('rooms:', await p.room.count({ where: { branchId: id } }));
  console.log('courses:', await p.course.count({ where: { branchId: id } }));
  console.log('staff:', await p.userBranch.count({ where: { branchId: id } }));
  await p.$disconnect();
})();
EOF
npx ts-node scripts/_verify-reset.ts <id>
```
Expected: `branch` qatori mavjud (nomi `Sinov filiali`); `students`, `groups`, `rooms`, `courses`, `staff` — hammasi 0.

- [ ] **Step 8: Sinov filialini tozalash**

Run (`<id>` ni almashtiring):
```bash
cd /Users/a1111/Desktop/daf-erp-system/server && cat > scripts/_drop-fixture.ts <<'EOF'
import { makePrisma } from './lib/check-cli';
const p = makePrisma();
const id = Number(process.argv[2]);
(async () => {
  await p.branch.delete({ where: { id } });
  console.log(`sinov filiali #${id} o'chirildi`);
  await p.$disconnect();
})();
EOF
npx ts-node scripts/_drop-fixture.ts <id> && rm scripts/_verify-reset.ts scripts/_drop-fixture.ts scripts/_fixture-throwaway-branch.ts
```
Expected: `sinov filiali #<id> o'chirildi`

- [ ] **Step 9: Butun test to'plami hali ham yashil ekanini tekshirish**

Run: `cd server && npx jest`
Expected: PASS — hech qanday mavjud test yiqilmagan

- [ ] **Step 10: Commit**

Fixture `_` prefiksi tufayli gitignore qilingan, demak commit qilinadigan yangi kod yo'q. Repetitsiya natijasini rejaga yozib qo'ying:

```bash
cd /Users/a1111/Desktop/daf-erp-system
git commit --allow-empty -m "Rehearse the branch reset end to end on the local database

A throwaway branch shaped like Namangan — students with linked accounts,
enrollments, SMS, a group, a room, a course, one staff member with a
notification — went through dry-run, a rejected confirm, the real run, and a
second run that found nothing left to do. The branch row and its cash accounts
were still there afterwards."
```

---

### Task 6: Prod'da bajarish

**Files:** yo'q — bu operatsion vazifa.

**Interfaces:**
- Consumes: Task 1–5

> **To'xtang.** Bu qadam prod ma'lumotini qaytarib bo'lmaydigan qilib o'chiradi. Har bir qadamdan keyin chiqishni foydalanuvchiga ko'rsating va davom etishdan oldin ruxsat oling.

- [ ] **Step 1: Prod'da dry-run**

Run: `cd server && railway run npx ts-node scripts/reset-branch.ts --branch=2`

Expected — jadval AYNAN shu sonlarni ko'rsatishi kerak (2026-08-19 da o'lchangan):

| O'chadigan | Soni |
|---|---|
| O'quvchi | 84 |
| O'quvchi akkaunti | 84 |
| Xodim | 7 |
| Enrollment | 87 |
| Guruh | 12 |
| Xona | 3 |
| Kurs | 4 |
| Kunlik surat | 14 |

Shuningdek: `Filial: Namangan filali (#2)` va `Bir nechta filialda turgan foydalanuvchilar: 10562`.

**Agar sonlar farq qilsa — to'xtang.** Bu 2026-08-19 dan beri filialda ish boshlanganini bildiradi; oldin nima o'zgarganini aniqlash kerak.

- [ ] **Step 2: Sonlarni foydalanuvchiga ko'rsatib, tasdiq olish**

Chiqishni to'liq ko'rsating va o'chirishga ruxsat so'rang.

- [ ] **Step 3: Zaxira bilan haqiqiy o'chirish**

Run:
```bash
cd server && railway run npx ts-node scripts/reset-branch.ts --branch=2 --backup --confirm="Namangan filali"
```

Expected:
- `Zaxira` bo'limida `server/scripts/backups/branch-2-reset-<sana>.json`
- `O'chirilmoqda` jadvali
- `Boshqa filiallarning ma'lumoti o'zgarmadi.`
- Exit code 0

**Agar `DIQQAT: boshqa filial ma'lumoti o'zgardi` chiqsa** — tranzaksiya allaqachon commit bo'lgan. Zaxira faylini saqlang va darhol xabar bering.

- [ ] **Step 4: Keyingi holatni mustaqil tekshirish**

Run:
```bash
cd server && railway run npx ts-node scripts/reset-branch.ts --branch=2
```
Expected: barcha sanoqlar 0, `Bir nechta filialda turgan foydalanuvchilar: 10562` hali ham ko'rinadi, `DRY-RUN`.

- [ ] **Step 5: Saqlanishi kerak bo'lgan narsalar joyidaligini tekshirish**

Run:
```bash
cd /Users/a1111/Desktop/daf-erp-system/server && cat > scripts/_verify-namangan.ts <<'EOF'
import { makePrisma } from './lib/check-cli';
const p = makePrisma();
(async () => {
  const b = await p.branch.findUnique({ where: { id: 2 } });
  console.log('branch:', b?.name, b?.startOfWorkingDay, b?.endOfWorkingDay, b?.status);
  console.log('cashAccounts:', await p.cashAccount.count({ where: { branchId: 2 } }));
  console.log('leadColumns:', await p.leadColumn.count({ where: { branchId: 2 } }));
  console.log('ceoLink:', await p.userBranch.count({ where: { userId: 10562, branchId: 2 } }));
  console.log('fargonaStudents:', await p.studentBranch.count({ where: { branchId: 1 } }));
  console.log('fargonaGroups:', await p.group.count({ where: { branchId: 1 } }));
  console.log('fargonaStaff:', await p.userBranch.count({ where: { branchId: 1 } }));
  await p.$disconnect();
})();
EOF
railway run npx ts-node scripts/_verify-namangan.ts
```
Expected: `branch: Namangan filali 08:00 22:00 ACTIVE`; `cashAccounts: 2`; `leadColumns: 1`; `ceoLink: 1`; `fargonaStudents: 788`; `fargonaGroups: 60`; `fargonaStaff: 27`.

Keyin `rm server/scripts/_verify-namangan.ts`.

- [ ] **Step 6: Zaxira faylini xavfsiz joyga ko'chirish**

`server/scripts/backups/` gitignore qilingan va Railway konteynerida emas, lokal mashinada. Faylni foydalanuvchiga ko'rsating va uni saqlab qo'yishni so'rang.

- [ ] **Step 7: Natijani hujjatlashtirish**

`docs/superpowers/specs/2026-08-19-namangan-branch-reset-design.md` ga bajarilgan sana va o'chirilgan qatorlar jadvalini qo'shing, `**Holat:**` ni `Bajarildi <sana>` ga o'zgartiring.

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add docs/superpowers/specs/2026-08-19-namangan-branch-reset-design.md
git commit -m "Record what the Namangan reset actually deleted in production"
```
