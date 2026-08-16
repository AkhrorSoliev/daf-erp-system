# Rolsiz xodim va uning lavozimi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Farrosh/qorovul kabi xodimlarni tizimga qo'shish — lavozimi bilan, tizim roli bermasdan.

**Architecture:** `User.position` (nullable matn ustuni) har bir xodimning ish nomini saqlaydi; `UserRole` esa faqat tizimga kirish huquqini beradi va endi ixtiyoriy. Rolsiz xodimga parol berish rad etiladi, shuning uchun u hech qaysi portalga kira olmaydi. Alohida `Position` jadvali ataylab yo'q — spec 3-bo'limiga qarang.

**Tech Stack:** NestJS + Prisma (PostgreSQL/Neon), Jest; Next.js + react-hook-form + zod + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-16-rolsiz-xodim-lavozimi-design.md`

## Global Constraints

- **Butun UI o'zbek tilida (lotin yozuvi).** Yorliqlar, xato xabarlari, toastlar — hammasi. Kirill yoki arab harflari ishlatilmaydi.
- **`prisma migrate dev` bu repoda ishlamaydi.** Migratsiya qo'shish tartibi: `prisma migrate diff` → SQL faylni tozalash → `prisma db execute` → `prisma migrate resolve --applied`. Batafsil Task 1 da.
- **CLAUDE.md fayllari faqat ingliz tilida yoziladi.** O'zbekcha matn faqat aynan UI qatorini keltirganda.
- **Backend haqiqiy xavfsizlik chegarasi.** Frontendda yashirilgan har bir cheklov backendda ham rad etilishi shart.
- **Har bir o'zgarishdan keyin test:** backend `cd server && npm test`, frontend `cd client && npm run build`. Ikkalasi ham o'tmaguncha ish tugallanmagan hisoblanadi.
- **Fayl hajmi:** komponentlar 100–300 qator maqsad, qat'iy chegara 500.
- Barcha buyruqlar repo ildizidan (`/Users/a1111/Desktop/daf-erp-system`) nisbatan yoziladi.

---

### Task 1: `User.position` ustuni va migratsiya

**Files:**
- Modify: `server/prisma/schema.prisma` (`model User`, `login`/`password` maydonlari yonida)
- Create: `server/prisma/migrations/20260816120000_user_position/migration.sql`

**Interfaces:**
- Consumes: —
- Produces: `User.position` — `string | null`, Prisma Client'da `position?: string | null`. Keyingi barcha tasklar shu maydonga tayanadi.

- [ ] **Step 1: Sxemaga maydon qo'shish**

`server/prisma/schema.prisma`, `model User` ichida, `login String?` qatoridan keyin:

```prisma
  login          String?
  position       String?
  password       String?
```

- [ ] **Step 2: Migratsiya SQL'ini generatsiya qilish**

```bash
cd server && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /tmp/position-diff.sql && cat /tmp/position-diff.sql
```

- [ ] **Step 3: SQL'ni tozalash va migratsiya papkasiga yozish**

Dev bazada oldindan mavjud drift bor (`Branch.workingDays`, `Transaction_reversedAt_idx`, `TelegramGroup` FK va h.k.). Diff ularni ham chiqaradi. **Faqat `position` ga tegishli qatorni oling** — qolgan hamma narsani tashlab yuboring, aks holda prodga deploy qilganda buziladi.

`server/prisma/migrations/20260816120000_user_position/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "position" TEXT;
```

- [ ] **Step 4: Dev bazaga qo'llash va yozib qo'yish**

```bash
cd server && npx prisma db execute --file prisma/migrations/20260816120000_user_position/migration.sql && npx prisma migrate resolve --applied 20260816120000_user_position && npx prisma generate
```

Kutilgan natija: `db execute` xatosiz, `migrate resolve` "Migration ... marked as applied", `generate` "Generated Prisma Client".

- [ ] **Step 5: Prisma Client'da maydon borligini tekshirish**

```bash
cd server && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Kutilgan natija: `position` bilan bog'liq xato yo'q (boshqa mavjud xatolar bo'lsa — ular bu taskka aloqasiz, `docs/branch-tsc-known-issues.md` ga qarang).

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/prisma/schema.prisma server/prisma/migrations/20260816120000_user_position
git commit -m "Give a user a job title that grants nothing

Add User.position — a plain nullable column. The five-role list decides
permission; it should not also have to name what someone does for a living."
```

---

### Task 2: DTO — `position` majburiy, `roleIds` va `password` ixtiyoriy

**Files:**
- Modify: `server/src/users/dto/create-user.dto.ts`
- Modify: `server/src/users/dto/update-user.dto.ts`

**Interfaces:**
- Consumes: `User.position` (Task 1)
- Produces:
  - `CreateUserDto.position: string` (majburiy, 2–60 belgi)
  - `CreateUserDto.roleIds?: number[]` (ixtiyoriy)
  - `CreateUserDto.password?: string` (ixtiyoriy, berilsa ≥4 belgi)
  - `UpdateUserDto.position?: string` (ixtiyoriy, berilsa 2–60 belgi)

- [ ] **Step 1: `CreateUserDto` ni o'zgartirish**

`server/src/users/dto/create-user.dto.ts` — import ro'yxatiga `MaxLength` qo'shing va `IsNotEmpty` ni olib tashlang (endi ishlatilmaydi):

```typescript
import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
```

`password` maydonini almashtiring:

```typescript
  @IsOptional()
  @IsString()
  @MinLength(4, { message: "Parol kamida 4 ta belgidan iborat bo'lishi kerak" })
  password?: string;
```

`roleIds` maydonini almashtiring:

```typescript
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  roleIds?: number[];
```

Va `roleIds` dan oldin yangi maydon qo'shing:

```typescript
  @IsString()
  @MinLength(2, { message: "Lavozim kamida 2 ta belgidan iborat bo'lishi kerak" })
  @MaxLength(60, { message: 'Lavozim 60 ta belgidan oshmasligi kerak' })
  position: string;
```

- [ ] **Step 2: `UpdateUserDto` ga `position` qo'shish**

`server/src/users/dto/update-user.dto.ts` — import ro'yxatiga `MaxLength` qo'shing, so'ng `roleIds` dan oldin:

```typescript
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Lavozim kamida 2 ta belgidan iborat bo'lishi kerak" })
  @MaxLength(60, { message: 'Lavozim 60 ta belgidan oshmasligi kerak' })
  position?: string;
```

- [ ] **Step 3: Kompilyatsiyani tekshirish**

```bash
cd server && npx tsc --noEmit 2>&1 | grep -i "users/dto\|users.service\|users.controller" | head
```

Kutilgan natija: bo'sh chiqish. (`create` chaqiruvida `position` hali uzatilmagan bo'lsa ham xato bo'lmaydi — `UsersService.create` o'zining alohida `data` tipini oladi, uni Task 3 da kengaytiramiz.)

- [ ] **Step 4: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/users/dto/create-user.dto.ts server/src/users/dto/update-user.dto.ts
git commit -m "Make the job title required and the role optional on user input

A cleaner has a position and no password; an administrator has both. The
DTO now says exactly that, and the service enforces the pairing."
```

---

### Task 3: Servis validatsiyasi — lavozim majburiy, rolsizga parol yo'q

Bu taskning yuragi — `assertRoleAndBranchRules` ning `if (!roleIds?.length) return;` bilan erta chiqib ketishi. Hozir rolsiz foydalanuvchida filial tekshiruvi umuman ishlamaydi.

**Files:**
- Modify: `server/src/users/users.service.ts` (`assertRoleAndBranchRules` ~82-170, `create` ~372-440, `updateUser` ~492-540)
- Test: `server/src/users/users.service.spec.ts` (yangi `describe` blok qo'shiladi)

**Interfaces:**
- Consumes: `CreateUserDto.position`, `CreateUserDto.roleIds?`, `CreateUserDto.password?` (Task 2)
- Produces:
  - `assertRoleAndBranchRules(roleIds, branchIds, mainBranch, companyId, callerUserId?, opts?: { position?: string | null; hasCredentials?: boolean })` — yangi 6-parametr
  - `UsersService.create(data)` — `data` tipiga `position?: string` qo'shiladi
  - Uchta yangi xato xabari (aynan shu matnlar testlarda tekshiriladi):
    - `"Lavozim ko'rsatilishi shart"`
    - `"Rolsiz xodim uchun kamida bitta filial tanlanishi shart"`
    - `"Tizim roli berilmagan xodimga login yoki parol berib bo'lmaydi"`

- [ ] **Step 1: Yiqiladigan testlarni yozish**

`server/src/users/users.service.spec.ts` faylining oxiriga qo'shing:

```typescript
describe('UsersService — rolsiz xodim (lavozim bilan)', () => {
  let service: UsersService;
  let prisma: any;

  const CEO_CALLER = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };

  const createdUser = {
    id: 10500,
    firstName: 'Zulfiya',
    lastName: 'Karimova',
    position: 'Farrosh',
    companyId: 1001,
    roles: [],
    branches: [{ branch: { id: 7, name: "Farg'ona filiali" } }],
    groupTeachers: [],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(CEO_CALLER),
        findUnique: jest.fn().mockResolvedValue(CEO_CALLER),
        create: jest.fn().mockResolvedValue(createdUser),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      branch: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  const base = {
    firstName: 'Zulfiya',
    lastName: 'Karimova',
    companyId: 1001,
    branchIds: [7],
  };

  it('rolsiz, lavozimli va filialli xodimni yaratadi', async () => {
    await service.create(
      { ...base, position: 'Farrosh', roleIds: [] },
      1, // CEO caller
    );

    expect(prisma.user.create).toHaveBeenCalled();
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.position).toBe('Farrosh');
    expect(data.password).toBeNull();
    // Rolsiz xodimda `roles` umuman yozilmaydi.
    expect(data.roles).toBeUndefined();
  });

  it('lavozimsiz xodimni rad etadi', async () => {
    await expect(
      service.create({ ...base, position: '   ', roleIds: [] }, 1),
    ).rejects.toThrow("Lavozim ko'rsatilishi shart");
  });

  it('rolsiz va filialsiz xodimni rad etadi', async () => {
    await expect(
      service.create(
        { ...base, branchIds: [], position: 'Qorovul', roleIds: [] },
        1,
      ),
    ).rejects.toThrow('Rolsiz xodim uchun kamida bitta filial tanlanishi shart');
  });

  it('rolsiz xodimga parol berishni rad etadi', async () => {
    await expect(
      service.create(
        { ...base, position: 'Farrosh', roleIds: [], password: 'parol123' },
        1,
      ),
    ).rejects.toThrow(
      'Tizim roli berilmagan xodimga login yoki parol berib bo\'lmaydi',
    );
  });

  it('rolsiz xodimga login berishni ham rad etadi', async () => {
    await expect(
      service.create(
        { ...base, position: 'Farrosh', roleIds: [], login: 'farrosh' },
        1,
      ),
    ).rejects.toThrow(
      'Tizim roli berilmagan xodimga login yoki parol berib bo\'lmaydi',
    );
  });

  it('lavozimni saqlashdan oldin trim qiladi', async () => {
    await service.create(
      { ...base, position: '  Qorovul  ', roleIds: [] },
      1,
    );
    expect(prisma.user.create.mock.calls[0][0].data.position).toBe('Qorovul');
  });
});
```

- [ ] **Step 2: Testlarni ishga tushirib, yiqilishiga ishonch hosil qilish**

```bash
cd server && npx jest src/users/users.service.spec.ts -t "rolsiz xodim" 2>&1 | tail -30
```

Kutilgan natija: FAIL — birinchi test `data.position` `undefined` bo'lgani uchun, qolganlari xato tashlanmagani uchun yiqiladi.

- [ ] **Step 3: `assertRoleAndBranchRules` ni qayta qurish**

`server/src/users/users.service.ts`. Metod imzosiga oltinchi parametr qo'shing va **erta chiqishni olib tashlang**:

```typescript
  private async assertRoleAndBranchRules(
    roleIds: number[] | undefined,
    branchIds: number[] | undefined,
    mainBranch: number | null | undefined,
    companyId: number,
    callerUserId?: number,
    opts?: { position?: string | null; hasCredentials?: boolean },
  ) {
    // Role escalation guard: only CEO can grant CEO role
    if (callerUserId && roleIds?.includes(CEO_ROLE_ID)) {
      // …mavjud blok o'zgarishsiz qoladi…
    }

    // A job title is what every list, badge and payroll row reads. It is the
    // one field that must be there whether or not the person can sign in.
    if (opts && opts.position !== undefined) {
      if (!opts.position?.trim()) {
        throw new BadRequestException("Lavozim ko'rsatilishi shart");
      }
    }

    const hasRoles = !!roleIds?.length;
    const hasBranches = !!branchIds && branchIds.length > 0;

    // No role means no sign-in, and a password is the second, independent
    // guarantee of that (`validateUser` refuses an account with none). Accept
    // one here and that guarantee is gone — so refuse rather than ignore.
    if (!hasRoles && opts?.hasCredentials) {
      throw new BadRequestException(
        "Tizim roli berilmagan xodimga login yoki parol berib bo'lmaydi",
      );
    }

    // A branch-less employee appears in no branch list and on no payroll
    // report, so this holds for the role-less too — which the old early
    // `return` skipped entirely.
    if (!hasRoles) {
      if (!hasBranches) {
        throw new BadRequestException(
          'Rolsiz xodim uchun kamida bitta filial tanlanishi shart',
        );
      }
    } else {
      const hasCeoRole = roleIds!.includes(CEO_ROLE_ID);
      const hasTeacherRole = roleIds!.includes(TEACHER_ROLE_ID);

      // Teacher must have at least one branch (more specific error first)
      if (hasTeacherRole && !hasCeoRole && !hasBranches) {
        throw new BadRequestException(
          "O'qituvchi uchun kamida bitta filial tanlanishi shart",
        );
      }

      // Non-CEO employees must have at least one branch
      if (!hasCeoRole && !hasBranches) {
        throw new BadRequestException(
          "CEO bo'lmagan xodim uchun kamida bitta filial tanlanishi shart",
        );
      }
    }
```

Metodning qolgan qismi (filiallar kompaniyaga tegishlimi, `mainBranch` tanlanganlar orasidami, `assertCallerInBranch` sikli) **o'zgarishsiz qoladi** — u endi rolsiz xodimga ham qo'llanadi, bu esa maqsad.

- [ ] **Step 4: `create` ni yangilash**

`server/src/users/users.service.ts`, `async create(...)`. `data` tipiga maydon qo'shing:

```typescript
      login?: string;
      position?: string;
      password?: string;
```

`assertRoleAndBranchRules` chaqiruvini almashtiring:

```typescript
    const position = data.position?.trim() ?? '';

    await this.assertRoleAndBranchRules(
      data.roleIds,
      data.branchIds,
      data.mainBranch,
      data.companyId,
      callerUserId,
      { position, hasCredentials: !!(data.password || data.login) },
    );
```

`prisma.user.create` ning `data` bloki ichida, `login` qatoridan keyin:

```typescript
          login: data.login || null,
          position,
```

- [ ] **Step 5: `updateUser` ni yangilash**

`server/src/users/users.service.ts`, `async updateUser(...)`. Qayta validatsiya shartini kengaytiring (`position` o'zgarganda ham ishlashi kerak):

```typescript
    // If roles, branches or the job title are being modified, re-validate
    // the combined state.
    if (
      dto.roleIds !== undefined ||
      dto.branchIds !== undefined ||
      dto.position !== undefined
    ) {
      const nextRoleIds =
        dto.roleIds ?? user.roles.map((ur: any) => ur.role.id);
      const nextBranchIds =
        dto.branchIds ?? user.branches.map((ub: any) => ub.branch.id);
      const nextMainBranch =
        dto.mainBranch !== undefined ? dto.mainBranch : user.mainBranch;
      await this.assertRoleAndBranchRules(
        nextRoleIds,
        nextBranchIds,
        nextMainBranch,
        user.companyId,
        changedById,
        {
          // Only validated when the caller actually sends one — an existing
          // employee with no title yet must stay editable.
          position: dto.position !== undefined ? dto.position : undefined,
          hasCredentials: !!(dto.password || dto.login),
        },
      );
    }
```

`updateData` bloki ichida, `if (dto.login !== undefined) …` qatoridan keyin:

```typescript
    if (dto.position !== undefined) updateData.position = dto.position.trim();
```

- [ ] **Step 6: `userSelect` ga `position` qo'shish**

`server/src/users/users.service.ts`, fayl boshidagi `const userSelect = {` ichida, `login: true,` qatoridan keyin:

```typescript
  login: true,
  position: true,
```

Bu maydon `/users` va `/users/:id` javoblarida qaytadi — Task 6 dagi ro'yxatlar shunga tayanadi.

- [ ] **Step 7: Testlarni ishga tushirish**

```bash
cd server && npx jest src/users/users.service.spec.ts 2>&1 | tail -20
```

Kutilgan natija: PASS — yangi 6 ta test va mavjud status/isActive testlari.

- [ ] **Step 8: To'liq backend testini yugurtirish**

```bash
cd server && npm test 2>&1 | tail -25
```

Kutilgan natija: barcha suite'lar o'tadi. Agar `users-branch.spec.ts` yoki `users.controller.spec.ts` yiqilsa — ular `create` ga `position` uzatmayapti; testni tuzating (`position: 'Administrator'` qo'shing), servisni emas.

- [ ] **Step 9: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/users/users.service.ts server/src/users/users.service.spec.ts
git commit -m "Stop skipping the branch check for an employee with no role

The rule bailed out early whenever roleIds was empty, so the one case that
needs a branch most — an employee who exists only to be paid — was the one
case that never got checked. A role-less employee is now refused a password
too: having none is the second, independent reason they cannot sign in."
```

---

### Task 4: Kirish imkoniyati yo'qligini test bilan mustahkamlash

Yangi kod yozilmaydi — `AuthService.validateUser` allaqachon `if (!user || !user.password) return null` qiladi. Bu test o'sha kafolatni qulflaydi, chunki u endi mahsulot talabi.

**Files:**
- Test: `server/src/auth/auth.service.spec.ts` (mavjud `describe('validateUser — phone-based login')` blokiga qo'shiladi)

**Interfaces:**
- Consumes: Task 3 dagi qoida (rolsiz xodimda parol yo'q)
- Produces: —

- [ ] **Step 1: Testni yozish**

`server/src/auth/auth.service.spec.ts`, `describe('validateUser — phone-based login', …)` bloki ichiga qo'shing:

```typescript
  it('parolsiz xodimni hech qanday portal filtri bilan kirita olmaydi', async () => {
    // A role-less employee (a cleaner, a guard) is created without a password.
    // This is the guarantee that holds even on localhost, where the portal
    // role filter is null and therefore applies nothing.
    prisma.user.findFirst.mockResolvedValue({
      id: 10500,
      firstName: 'Zulfiya',
      lastName: 'Karimova',
      position: 'Farrosh',
      password: null,
      roles: [],
      branches: [{ branch: { id: 7, name: "Farg'ona filiali" } }],
    });

    await expect(
      service.validateUser('901234567', 'nimadir', null),
    ).resolves.toBeNull();

    await expect(
      service.validateUser('901234567', 'nimadir', [1, 2, 3, 5]),
    ).resolves.toBeNull();
  });
```

**Kontekst:** bu faylda `AuthService` `Test.createTestingModule` orqali emas, to'g'ridan-to'g'ri `new AuthService(prisma, jwt, config, redis)` bilan quriladi, va mock `prisma.user.findFirst` deb ataladi — yuqoridagi kod shu shaklga mos, o'zgartirish shart emas.

- [ ] **Step 2: Testni ishga tushirish**

```bash
cd server && npx jest src/auth/auth.service.spec.ts -t "parolsiz xodimni" 2>&1 | tail -20
```

Kutilgan natija: PASS darhol — bu regressiya qulfi, yangi xatti-harakat emas. Agar FAIL bo'lsa, mock nomi/shakli noto'g'ri; testni tuzating.

- [ ] **Step 3: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/auth/auth.service.spec.ts
git commit -m "Lock in that a password-less employee can never sign in

validateUser already refuses an account with no password, and that is now
a product requirement rather than an implementation detail — it is what
holds on localhost, where the portal role filter applies nothing at all."
```

---

### Task 5: Oylik stavkalari ro'yxatida lavozimni ko'rsatish

`SalaryStaffConfigService` rolsiz xodimni allaqachon qamrab oladi — filtri `roles: { none: { role: { name: { in: ['Teacher','Student'] } } } }`, va bo'sh rol ro'yxati bu shartga to'g'ri keladi. Yetishmayotgani — `position` maydoni; usiz qatorda lavozim `—` bo'lib chiqadi.

**Files:**
- Modify: `server/src/salary/salary-staff-config.service.ts` (`StaffConfigRow` ~19-41, `select` ~111-119, `rows` map ~140-156)
- Test: `server/src/salary/salary-staff-config.service.spec.ts`

**Interfaces:**
- Consumes: `User.position` (Task 1)
- Produces: `StaffConfigRow.user.position: string | null` — Task 6 dagi frontend shunga tayanadi.

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/salary/salary-staff-config.service.spec.ts` — fayl boshidagi `const admin = { … }` yonига qo'shing:

```typescript
const cleaner = {
  id: 10500,
  firstName: 'Zulfiya',
  lastName: 'Karimova',
  isActive: true,
  status: 'ACTIVE',
  position: 'Farrosh',
  roles: [],
  branches: [{ branch: { id: 7, name: "Farg'ona filiali" } }],
};
```

So'ng faylning oxirgi `it(...)` dan keyin, xuddi shu `describe` ichida:

```typescript
  it('rolsiz xodimni lavozimi bilan qaytaradi', async () => {
    prisma.user.findMany.mockResolvedValue([cleaner]);

    const { data } = await service.listStaff({}, 1001, 1);

    expect(data).toHaveLength(1);
    expect(data[0].user.position).toBe('Farrosh');
    expect(data[0].user.roles).toEqual([]);
    // No rate yet — the whole reason this row is actionable.
    expect(data[0].configs).toEqual([]);
  });

  it('lavozimni tanlab oladi', async () => {
    await service.listStaff({}, 1001, 1);
    expect(prisma.user.findMany.mock.calls[0][0].select.position).toBe(true);
  });
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishiga ishonch hosil qilish**

```bash
cd server && npx jest src/salary/salary-staff-config.service.spec.ts 2>&1 | tail -25
```

Kutilgan natija: FAIL — `data[0].user.position` `undefined`, va `select.position` `undefined`.

- [ ] **Step 3: `StaffConfigRow` tipiga maydon qo'shish**

`server/src/salary/salary-staff-config.service.ts`, `export interface StaffConfigRow` ichida, `roles` maydonidan keyin:

```typescript
    roles: { id: number; name: string }[];
    /**
     * The job title. It is the ONLY label a role-less employee has — a
     * cleaner or a guard carries no role by design, so a roles-derived label
     * would render them as "—" on the one screen that exists to give them a
     * rate. Null for employees created before this column, who fall back to
     * their role label on the client.
     */
    position: string | null;
    isActive: boolean;
```

- [ ] **Step 4: `select` va `rows` map ni yangilash**

Xuddi shu faylda, `this.prisma.user.findMany({ … select: {` ichida `lastName: true,` dan keyin:

```typescript
        lastName: true,
        position: true,
        isActive: true,
```

Va `const rows: StaffConfigRow[] = staff.map((s) => ({` ichida, `roles:` qatoridan keyin:

```typescript
        roles: s.roles.map((r) => r.role),
        position: s.position,
        isActive: s.isActive,
```

- [ ] **Step 5: Testlarni ishga tushirish**

```bash
cd server && npx jest src/salary/salary-staff-config.service.spec.ts 2>&1 | tail -20
```

Kutilgan natija: PASS — barcha testlar, jumladan mavjud "excludes Teacher AND Student accounts".

- [ ] **Step 6: To'liq backend testini yugurtirish**

```bash
cd server && npm test 2>&1 | tail -20
```

Kutilgan natija: barcha suite'lar o'tadi.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/salary/salary-staff-config.service.ts server/src/salary/salary-staff-config.service.spec.ts
git commit -m "Carry the job title onto the staff rate list

The list already returned a role-less employee — an empty role array
satisfies its none-of-Teacher-or-Student filter. It just had nothing to
call them, which reads as a dash on the one screen that exists to set
their rate."
```

---

### Task 6: Frontend — lavozim maydoni va ro'yxatlar

**Files:**
- Modify: `client/src/hooks/use-edit-employee.ts` (`EmployeeUser` interfeysi, ~3-17)
- Modify: `client/src/components/settings/edit-employee-form.tsx` (zod sxema ~49-103, `defaultValues` ~127-139, `onSubmit` ~184-217, forma bo'limlari ~302-374)
- Modify: `client/src/components/payments/salary-utils.ts` (`roleLabel` dan keyin)
- Modify: `client/src/components/payments/salary-staff-config-list.tsx` (`StaffConfigRow` ~12-28, yorliq ~112)
- Modify: `client/src/components/settings/employees-settings-client.tsx` (mobil qator ~273-279, jadval katakchasi ~344-352)

**Interfaces:**
- Consumes: `StaffConfigRow.user.position` (Task 5), `/users` javobidagi `position` (Task 3, Step 6), `CreateUserDto.position` (Task 2)
- Produces: `positionLabel(user: { position?: string | null; roles?: { id: number }[] }): string` — `salary-utils.ts` dan eksport.

- [ ] **Step 1: `EmployeeUser` tipiga `position` qo'shish**

`client/src/hooks/use-edit-employee.ts`, `login` maydonidan keyin:

```typescript
  login: string | null;
  position: string | null;
```

- [ ] **Step 2: `positionLabel` yordamchisini yozish**

`client/src/components/payments/salary-utils.ts`, `primaryRoleLabel` funksiyasidan keyin:

```typescript
/**
 * What to call an employee. The job title wins because it is the only label a
 * role-less employee has — a cleaner carries no role by design. Employees
 * created before the column exists fall back to their role.
 */
export function positionLabel(user: {
  position?: string | null;
  roles?: { id: number }[];
}): string {
  return user.position?.trim() || roleLabel(user.roles);
}
```

- [ ] **Step 3: Stavkalar ro'yxatida lavozimni ko'rsatish**

`client/src/components/payments/salary-staff-config-list.tsx`:

Import qatorini almashtiring:

```typescript
import { positionLabel } from "./salary-utils";
```

`StaffConfigRow` interfeysida `roles` dan keyin:

```typescript
    roles: { id: number; name: string }[];
    position: string | null;
```

Va yorliqni almashtiring (~112-qator):

```typescript
                {positionLabel(row.user)}
                {row.user.branch ? ` · ${row.user.branch.name}` : ""}
```

- [ ] **Step 4: Xodimlar ro'yxatida lavozimni ko'rsatish**

`client/src/components/settings/employees-settings-client.tsx`.

Fayl boshidagi importlarga qo'shing:

```typescript
import { positionLabel } from "@/components/payments/salary-utils";
```

**Mobil qator** — `<div className="flex flex-wrap gap-1 mt-0.5">` ichidagi `emp.roles.map(...)` blokini almashtiring:

```tsx
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {positionLabel(emp)}
                        </span>
                      </div>
```

**Jadval katakchasi** — `<TableCell>` ichidagi `emp.roles.map(...)` blokini almashtiring. Lavozim asosiy yorliq, rol esa ikkinchi darajali belgi bo'lib qoladi (rolsiz xodimda umuman chiqmaydi):

```tsx
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium">{positionLabel(emp)}</span>
                        {emp.roles.map((r) => (
                          <Badge
                            key={r.id}
                            variant={ROLE_VARIANTS[r.name] || "outline"}
                            className="text-[10px] font-normal"
                          >
                            {ROLE_LABELS[r.name] || r.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
```

- [ ] **Step 5: Formaning zod sxemasini yangilash**

`client/src/components/settings/edit-employee-form.tsx`. `schema` obyektida `roleIds` ni almashtiring va `position` qo'shing:

```typescript
    position: z
      .string()
      .trim()
      .min(2, "Lavozim kamida 2 ta belgidan iborat bo'lishi kerak")
      .max(60, "Lavozim 60 ta belgidan oshmasligi kerak"),
    roleIds: z.array(z.number()),
```

`.superRefine` ichida filial tekshiruvini almashtiring (rolsiz xodimga ham filial shart):

```typescript
    const hasCeoRole = data.roleIds.includes(CEO_ROLE_ID);
    const hasTeacherRole = data.roleIds.includes(TEACHER_ROLE_ID);
    const hasRoles = data.roleIds.length > 0;

    if (!hasCeoRole && data.branchIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["branchIds"],
        message: !hasRoles
          ? "Tizimga kirmaydigan xodim uchun ham filial tanlanishi shart"
          : hasTeacherRole
            ? "O'qituvchi uchun kamida bitta filial tanlang"
            : "Kamida bitta filial tanlang",
      });
    }
```

Va parol shartini almashtiring — parol faqat rol berilganda majburiy:

```typescript
    if (!data.isEdit && hasRoles) {
      if (!data.password || data.password.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: "Yangi xodim uchun parol majburiy (kamida 4 ta belgi)",
        });
      }
    } else if (data.password && data.password.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Parol kamida 4 ta belgidan iborat bo'lishi kerak",
      });
    }
```

- [ ] **Step 6: `defaultValues` va `onSubmit` ni yangilash**

`defaultValues` ichida, `login` dan keyin:

```typescript
      login: employee?.login ?? "",
      position: employee?.position ?? roleLabel(employee?.roles ?? []).replace("—", ""),
```

Import qo'shing (fayl boshiga):

```typescript
import { roleLabel } from "@/components/payments/salary-utils";
```

Bu mavjud xodimni tahrirlashda maydonni rol nomi bilan oldindan to'ldiradi, ya'ni lavozim birinchi tahrirda o'zi yoziladi — alohida backfill skripti kerak emas.

`onSubmit` ichida, `payload` obyektiga qo'shing:

```typescript
      const payload: Record<string, any> = {
        firstName: values.firstName,
        lastName: values.lastName,
        position: values.position,
        roleIds: values.roleIds,
        branchIds: values.branchIds,
      };
```

- [ ] **Step 7: Formaga «Lavozim» maydonini va shartli «Kirish ma'lumotlari» ni qo'shish**

`watchRoleIds` allaqachon mavjud (~219-qator). Undan keyin qo'shing:

```typescript
  const hasRoles = watchRoleIds.length > 0;
```

**«Kirish ma'lumotlari» bo'limini** butunlay shartli qiling — `<section className="space-y-5 border-t px-6 py-5">` dan boshlanadigan, ichida `login` va `password` bor blokni o'rab oling:

```tsx
      {/* Kirish ma'lumotlari — faqat tizim roli berilganda.
          Rolsiz xodim baribir kira olmaydi (backend parolni rad etadi), shuning
          uchun maydonlarni ko'rsatish faqat chalg'itadi. */}
      {hasRoles && (
        <section className="space-y-5 border-t px-6 py-5">
          {/* …mavjud sarlavha va ikkita maydon o'zgarishsiz… */}
        </section>
      )}
```

**«Lavozim va filial» bo'limida** — sarlavhadan keyin, rol katakchalaridan **oldin** yangi maydon qo'shing:

```tsx
        <div className="space-y-1.5">
          <Label htmlFor="position">Lavozim *</Label>
          <Input
            id="position"
            placeholder="Masalan: Farrosh, Qorovul, Administrator"
            {...form.register("position")}
          />
          {form.formState.errors.position && (
            <p className="text-xs text-destructive">
              {form.formState.errors.position.message}
            </p>
          )}
        </div>
```

Va rol katakchalarining `<Label>` ini almashtiring — endi majburiy emas:

```tsx
          <Label>Tizim huquqi</Label>
          <p className="text-xs text-muted-foreground">
            Rol berilmasa, xodim tizimga kira olmaydi — faqat ro'yxatda turadi
            va oylik oladi.
          </p>
```

- [ ] **Step 8: Build'ni tekshirish**

```bash
cd client && npm run build 2>&1 | tail -25
```

Kutilgan natija: "Compiled successfully". TypeScript xatosi chiqsa — ko'pincha `EmployeeUser` ga `position` qo'shilmagani yoki `StaffConfigRow` tipida yetishmayotgani; o'sha faylni tuzating.

- [ ] **Step 9: Qo'lda tekshirish**

Dev serverlarni ishga tushiring (`/restart` yoki `cd server && npm run start:dev`, `cd client && npm run dev`), so'ng:

1. Sozlamalar → Xodimlar → «Yangi xodim». Lavozim `Farrosh`, filial tanlang, rol **tanlamang**. «Kirish ma'lumotlari» bo'limi ko'rinmasligi kerak. Saqlang → «Xodim muvaffaqiyatli qo'shildi».
2. Xodimlar ro'yxatida yangi xodim «Farrosh» lavozimi bilan, rol badge'isiz ko'rinishi kerak.
3. Moliya → Oylik → ⚙ Sozlamalar → «Xodimlar stavkalari». Yangi xodim ro'yxatda «Farrosh» deb, «Belgilanmagan» belgisi bilan turishi kerak. Qalamni bosing — faqat **Belgilangan oylik** taklif qilinishi kerak.
4. Lavozimni bo'sh qoldirib saqlashga urinib ko'ring → maydon ostida xato chiqishi kerak.

- [ ] **Step 10: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/hooks/use-edit-employee.ts client/src/components/settings/edit-employee-form.tsx client/src/components/payments/salary-utils.ts client/src/components/payments/salary-staff-config-list.tsx client/src/components/settings/employees-settings-client.tsx
git commit -m "Ask what someone does before asking what they may do

The form led with five system roles, so adding a cleaner meant granting a
permission to describe a job. Lavozim now comes first and is required of
everyone; the roles below it are optional access, and the login fields
appear only once one is given."
```

---

### Task 7: CLAUDE.md hujjatlarini yangilash

**Files:**
- Modify: `server/CLAUDE.md` (RBAC bo'limi — «Role hierarchy» dan keyin)
- Modify: `client/CLAUDE.md` («Employee & Teacher Status» bo'limidan oldin)

**Interfaces:**
- Consumes: Task 1–6 dagi barcha o'zgarishlar
- Produces: —

- [ ] **Step 1: `server/CLAUDE.md` ga bo'lim qo'shish**

**Ingliz tilida** (fayl til siyosati). `#### Role hierarchy` blokidan keyin:

```markdown
#### Position vs role — a job title grants nothing

`User.position` names what an employee does; `UserRole` decides what they may
do. A cleaner or a guard has a position and **no role at all**, which is the
only way to put them on payroll without handing them a permission to describe
their job. Do not add permission-less rows to the `Role` table to solve this:
role ids and names are read by `@Roles()` guards, `portal-roles.config.ts`,
`GRANTABLE_ROLE_IDS` and payroll filters, and any one of them forgetting to
exclude the new row would silently grant access.

- `position` is **required on create** for every employee (`CreateUserDto`),
  nullable in the schema so pre-existing rows keep working. There is no
  backfill script — the employee form pre-fills the field from the role label,
  so a title is written the first time anyone is edited.
- `roleIds` is **optional**. `assertRoleAndBranchRules` no longer returns early
  on an empty role list — that early return meant the one employee who most
  needs a branch (one who exists only to be paid) was the one never checked.
- **A role-less employee is refused a login or password** (400). Two
  independent things then keep them out: `validateUser` returns null for an
  account with no password (this holds on localhost, where the portal role
  filter applies nothing), and the portal lookup requires
  `roles.some.role.id ∈ allowedRoleIds`, which an empty role list never
  satisfies. Do not relax the password refusal — it is half of that pair.
- `SalaryStaffConfigService.listStaff` already covered role-less employees
  (an empty role array satisfies its none-of-`['Teacher','Student']` filter);
  it now returns `position` so the rate list has something to call them.
  `SalaryConfigRowSheet` sees no role 4 and offers FIXED_MONTHLY alone.

There is deliberately **no `Position` table** yet. Promote this string to one
when any of these becomes true: reports need to filter or group by position;
more than one person adds employees (typo risk multiplies); or a title must be
renamed in one place and change everywhere.
```

- [ ] **Step 2: `client/CLAUDE.md` ga bo'lim qo'shish**

**Ingliz tilida.** `### Employee & Teacher Status (Faollik holati)` sarlavhasidan **oldin**:

```markdown
### Position vs role in the employee form

`edit-employee-form.tsx` asks for **Lavozim** (`position`, required, free text)
before it asks for **Tizim huquqi** (`roleIds`, optional). The job title is what
every list renders; the roles are only access.

- The **"Kirish ma'lumotlari"** section (login + password) renders **only when
  at least one role is selected**. A role-less employee cannot sign in — the
  backend refuses a password for them — so showing the fields would only
  mislead. Do not make them unconditional.
- Password is required on create **only when a role is given**.
- Branch stays required for everyone except a CEO, role-less employees
  included: a branch-less employee appears in no branch list and on no payroll
  report.
- Render the label with `positionLabel(user)` from
  `components/payments/salary-utils.ts` — job title first, falling back to the
  role for employees created before the column existed. Do not read
  `user.roles` directly for a "Lavozim" column; a cleaner has none.
- Editing an existing employee pre-fills Lavozim from their role label, which
  is how the field gets backfilled without a script.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/CLAUDE.md client/CLAUDE.md
git commit -m "Write down why the job title is not a role

Both files now say what position is for, why a permission-less Role row was
rejected, and which two independent things keep a role-less employee out of
every portal — so neither gets relaxed by someone tidying up later."
```

---

### Task 8: Yakuniy tekshiruv

**Files:** —

**Interfaces:**
- Consumes: Task 1–7
- Produces: —

- [ ] **Step 1: To'liq backend testi**

```bash
cd server && npm test 2>&1 | tail -20
```

Kutilgan natija: barcha suite'lar PASS.

- [ ] **Step 2: Frontend build**

```bash
cd client && npm run build 2>&1 | tail -15
```

Kutilgan natija: "Compiled successfully".

- [ ] **Step 3: Migratsiya holatini tekshirish**

```bash
cd server && npx prisma migrate status 2>&1 | tail -10
```

Kutilgan natija: "Database schema is up to date!" — `20260816120000_user_position` qo'llangan deb ko'rsatiladi.

- [ ] **Step 4: Deploy holatini aytib berish**

Deploy **bu rejaga kirmaydi**. Ish tugagach foydalanuvchiga quyidagilarni ayting:

- Migratsiya faqat **dev** bazaga qo'llandi. Prod (Railway `caring-courage`) uchun alohida `migrate deploy` kerak.
- Railway backendi GitHub'ga ulanmagan — merge deploy degani emas, `railway up` qo'lda bajariladi.
- Repoda deploy qilinmagan boshqa ish ham bor (`salary-staff-config-list.tsx` va h.k.), shuning uchun deploy tartibini foydalanuvchi hal qiladi.
