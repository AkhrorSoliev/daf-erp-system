# Har bir o'quvchi lid sifatida tug'iladi — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi yaratishning ikkala yo'li ham lid yozuvini qoldirsin, shunda voronka
va manba statistikasi to'liq bo'ladi.

**Architecture:** `StudentsWriteService.create` ga majburiy `origin` parametri qo'shiladi
(`DIRECT` | `LEAD`). `DIRECT` bo'lsa, o'quvchi yaratilayotgan **o'sha tranzaksiya ichida**
`StudentLeadOriginService` telefon bo'yicha mavjud lidni topib `CONVERTED` qiladi yoki
bo'limsiz (`sectionId: null`) yangi lid yozuvini yaratadi. Frontendda "O'quvchi qo'shish"
oynasiga majburiy "Qayerdan bildi?" maydoni, lidlar ro'yxatiga esa "O'quvchi" va
"Aylangan sana" ustunlari qo'shiladi.

**Tech Stack:** NestJS + Prisma (server, jest), Next.js + React Hook Form + zod
(client, vitest).

**Dizayn hujjati:** `docs/superpowers/specs/2026-09-10-lid-oquvchi-konversiya-design.md`

## Global Constraints

- **Hech qanday baza migratsiyasi yo'q.** Ishlatiladigan hamma ustun allaqachon mavjud:
  `Lead.sectionId` (nullable), `Lead.branchId`, `Lead.sourceId`, `Lead.convertedStudentId`,
  `Lead.statusChangedAt`, `Lead.statusChangedById`. Yangi ustun yoki relation
  **qo'shilmaydi** — `convertedStudentId` uchun Prisma relation yaratish FK constraint
  talab qiladi va migratsiyaga olib keladi.
- **Foydalanuvchiga ko'rinadigan hamma matn — lotin alifbosidagi o'zbekchada.** Kirill
  yoki arab harflari ishlatilmaydi.
- **Telefon formati:** `Lead.phone` ham, `Student.phone` ham DTO darajasida `/^\d{9}$/`
  bilan tekshiriladi, shuning uchun moslashtirish **aniq tenglik** bo'yicha
  (`phone: params.phone`), normalizatsiyasiz. Eski, formatga mos kelmaydigan yozuv
  topilmasa yangi lid yaratiladi — bu bugungi holatdan yomonroq emas.
- **Eski 892 ta lidsiz o'quvchiga tegilmaydi.** Hech qanday backfill skripti yozilmaydi.
- **Tranzaksiya majburiy:** lid yozuvi o'quvchi bilan bitta `$transaction` ichida
  yoziladi. `EventEmitter2` ishlatilmaydi.
- **Modul halqasi taqiqlanadi:** `LeadsModule` allaqachon `StudentsModule` ni import
  qiladi, shuning uchun `students` moduli `LeadsService` ni import qilmaydi —
  `prisma.lead` ga to'g'ridan yoziladi.
- Server testi: `cd server && npx jest <path>`. Client testi: `cd client && npx vitest run <path>`.

---

## Task 0: Worktree'ni ishga tayyorlash

**Files:** yo'q (faqat bog'liqliklar)

- [ ] **Step 1: Bog'liqliklarni o'rnatish**

Worktree yangi yaratilgan va `node_modules` yo'q — testlar shusiz ishlamaydi.

```bash
cd server && npm install && npx prisma generate
cd ../client && npm install
```

- [ ] **Step 2: Mavjud testlar o'tishini tekshirish**

```bash
cd server && npx jest src/leads src/students
```

Kutilgan: hammasi PASS. O'tmasa — davom etmang, avval sababini aniqlang.

---

## Task 1: `StudentLeadOriginService` — lid yozuvi yaratish yadrosi

**Files:**
- Create: `server/src/students/student-origin.types.ts`
- Create: `server/src/students/student-lead-origin.service.ts`
- Test: `server/src/students/student-lead-origin.service.spec.ts`

**Interfaces:**
- Produces: `StudentOrigin` union tipi; `StudentLeadOriginService.recordDirectOrigin(tx, params): Promise<void>`.
  `params` = `{ studentId: number; firstName: string; lastName: string; phone: string; branchId: number | null; companyId: number; sourceId: string; userId?: number }`.

- [ ] **Step 1: Tip faylini yaratish**

`server/src/students/student-origin.types.ts`:

```ts
/**
 * Har bir o'quvchi lid sifatida tug'iladi. `create()` ga BERILISHI SHART bo'lgan
 * bu parametr "bu odam qayerdan keldi?" degan savolga javob berishga majbur
 * qiladi — `skipLead?: boolean` ko'rinishidagi ixtiyoriy bayroq unutilishi
 * mumkin edi, majburiy union tipni unutib bo'lmaydi.
 *
 * DIRECT — /students eshigi. Lid yozuvi yo'q, tizim uni o'zi yaratadi.
 * LEAD   — LeadsService.convert. Lid allaqachon bor, ikkinchisi yaratilmaydi.
 */
export type StudentOrigin =
  | { kind: 'DIRECT'; sourceId: string }
  | { kind: 'LEAD'; leadId: string };
```

- [ ] **Step 2: Yiqiladigan testni yozish**

`server/src/students/student-lead-origin.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus } from '@prisma/client';
import { StudentLeadOriginService } from './student-lead-origin.service';

/**
 * O'quvchi lidsiz tug'ilmasligi kerak. Prodda 936 o'quvchidan atigi 44 tasi
 * lidga bog'langan edi, chunki /students eshigi lid yozuvini qoldirmasdi.
 */
describe('StudentLeadOriginService', () => {
  let service: StudentLeadOriginService;
  let tx: any;

  const COMPANY = 1001;
  const baseParams = {
    studentId: 555,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    branchId: 7,
    companyId: COMPANY,
    sourceId: 'src-instagram',
    userId: 42,
  };

  beforeEach(async () => {
    tx = {
      lead: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'lead-new' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentLeadOriginService],
    }).compile();

    service = module.get(StudentLeadOriginService);
  });

  it("mos lid topilmasa bo'limsiz CONVERTED lid yaratadi", async () => {
    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.create).toHaveBeenCalledTimes(1);
    const data = tx.lead.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      firstName: 'Ali',
      lastName: 'Valiyev',
      phone: '901234567',
      companyId: COMPANY,
      branchId: 7,
      sectionId: null,
      sourceId: 'src-instagram',
      statusEnum: LeadStatus.CONVERTED,
      convertedStudentId: 555,
      statusChangedById: 42,
    });
    expect(data.statusChangedAt).toBeInstanceOf(Date);
  });

  it('mos lid topilsa yangisini yaratmaydi, mavjudini CONVERTED qiladi', async () => {
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);

    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.create).not.toHaveBeenCalled();
    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['lead-1'] } },
      data: expect.objectContaining({
        statusEnum: LeadStatus.CONVERTED,
        convertedStudentId: 555,
        statusChangedById: 42,
      }),
    });
  });

  it("bir xil telefonli bir nechta lidning HAMMASINI bog'laydi", async () => {
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }, { id: 'lead-2' }]);

    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['lead-1', 'lead-2'] } },
      data: expect.any(Object),
    });
  });

  it("mavjud lidning o'z manbasini o'zgartirmaydi", async () => {
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);

    await service.recordDirectOrigin(tx, baseParams);

    const data = tx.lead.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('sourceId');
  });

  it("faqat tirik va aylantirilmagan lidlarni qidiradi", async () => {
    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.findMany).toHaveBeenCalledWith({
      where: {
        phone: '901234567',
        deletedAt: null,
        companyId: COMPANY,
        statusEnum: {
          in: [
            LeadStatus.NEW,
            LeadStatus.CONTACTED,
            LeadStatus.TRIAL,
            LeadStatus.LOST,
          ],
        },
      },
      select: { id: true },
    });
  });
});
```

- [ ] **Step 3: Testni ishga tushirib, yiqilishini tasdiqlash**

```bash
cd server && npx jest src/students/student-lead-origin.service.spec.ts
```

Kutilgan: FAIL — `Cannot find module './student-lead-origin.service'`.

- [ ] **Step 4: Minimal amalga oshirish**

`server/src/students/student-lead-origin.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';

/**
 * Bo'limsiz lid — bu doskadagi kartochka emas, kelib chiqish yozuvi.
 *
 * `sectionId` ataylab `null`: bu lid darhol CONVERTED bo'ladi va `getBoard`
 * CONVERTED ni yashiradi, ya'ni u doskada bir soniya ham turmaydi. Unga bo'lim
 * tanlash faqat adminning haqiqiy guruh jadvalini ("A1 SPSH 15:00 Munisa")
 * ifloslantirgan bo'lardi. Filial bo'limdan emas, o'quvchidan olinadi — lidning
 * o'z `branchId` maydoni bor.
 */
const MATCHABLE_STAGES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.TRIAL,
  // LOST ham qidiriladi: yo'qotilgan deb belgilangan odam qaytib kelib
  // ro'yxatdan o'tsa, u eski kartochkasi bilan bog'lanishi kerak.
  LeadStatus.LOST,
];

export interface DirectOriginParams {
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number | null;
  companyId: number;
  sourceId: string;
  userId?: number;
}

@Injectable()
export class StudentLeadOriginService {
  /**
   * `LeadsService` ni import QILMAYDI: `LeadsModule` allaqachon `StudentsModule`
   * ni import qiladi, teskari import halqa yasaydi. Bu yerda doska mantig'i
   * kerak emas, shuning uchun `prisma.lead` ga to'g'ridan yoziladi.
   *
   * `tx` — o'quvchi yaratilayotgan tranzaksiya. Lid yozilmasa o'quvchi ham
   * yozilmaydi; hodisa (event) mexanizmi bu kafolatni bera olmaydi.
   */
  async recordDirectOrigin(
    tx: Prisma.TransactionClient,
    params: DirectOriginParams,
  ): Promise<void> {
    const now = new Date();

    const matched = await tx.lead.findMany({
      where: {
        phone: params.phone,
        deletedAt: null,
        companyId: params.companyId,
        statusEnum: { in: MATCHABLE_STAGES },
      },
      select: { id: true },
    });

    if (matched.length > 0) {
      // Mavjud lid o'z bo'limida va o'z manbasi bilan qoladi — uning kelib
      // chiqishi haqiqat, admin endi tanlagan manba emas.
      await tx.lead.updateMany({
        where: { id: { in: matched.map((l) => l.id) } },
        data: {
          statusEnum: LeadStatus.CONVERTED,
          status: 'converted',
          convertedStudentId: params.studentId,
          statusChangedAt: now,
          statusChangedById: params.userId ?? null,
        },
      });
      return;
    }

    await tx.lead.create({
      data: {
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone,
        companyId: params.companyId,
        branchId: params.branchId,
        sectionId: null,
        sourceId: params.sourceId,
        statusEnum: LeadStatus.CONVERTED,
        status: 'converted',
        convertedStudentId: params.studentId,
        statusChangedAt: now,
        statusChangedById: params.userId ?? null,
      },
    });
  }
}
```

- [ ] **Step 5: Testlar o'tishini tasdiqlash**

```bash
cd server && npx jest src/students/student-lead-origin.service.spec.ts
```

Kutilgan: 5 test PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/students/student-origin.types.ts \
        server/src/students/student-lead-origin.service.ts \
        server/src/students/student-lead-origin.service.spec.ts
git commit -m "Lid kelib chiqish yozuvi xizmati

Bo'limsiz CONVERTED lid yaratadi yoki telefon bo'yicha mavjud lidni topib
aylantiradi. LeadsService import qilinmaydi (modul halqasi).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `create()` ga majburiy `origin` parametri

**Files:**
- Create: `server/src/students/dto/create-student-direct.dto.ts`
- Modify: `server/src/students/students-write.service.ts` (`create`, konstruktor)
- Modify: `server/src/students/students.service.ts:108`
- Modify: `server/src/students/students.controller.ts:92-98`
- Modify: `server/src/students/students.module.ts` (provider)
- Modify: `server/src/leads/leads.service.ts:887`
- Test: `server/src/students/students-write.origin.spec.ts`

**Interfaces:**
- Consumes: `StudentOrigin` va `StudentLeadOriginService.recordDirectOrigin` (Task 1).
- Produces: `StudentsWriteService.create(dto, companyId, userId, origin)` va
  `StudentsService.create(dto, companyId, userId, origin)` — `origin` **majburiy**,
  oxirgi parametr.

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/students/students-write.origin.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentsWriteService } from './students-write.service';
import { StudentLeadOriginService } from './student-lead-origin.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status/status-history.service';
import { StatusCascadeService } from '../common/status/status-cascade.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Prodda 936 o'quvchidan 892 tasi /students eshigidan kirgan va lid yozuvi
 * qoldirmagan. Bu testlar shu eshikni yopadi.
 */
describe('StudentsWriteService — lid kelib chiqishi', () => {
  let service: StudentsWriteService;
  let origin: { recordDirectOrigin: jest.Mock };
  let tx: any;

  const COMPANY = 1001;
  const dto = {
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    branchIds: [7],
  } as any;

  beforeEach(async () => {
    const created = { id: 555, firstName: 'Ali', lastName: 'Valiyev' };
    tx = {
      student: {
        create: jest.fn().mockResolvedValue(created),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...created,
          branches: [{ id: 7, name: "Farg'ona filiali" }],
        }),
      },
      studentBranch: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      lead: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    };

    const prisma = {
      student: { findFirst: jest.fn().mockResolvedValue(null) },
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 7 }) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      // Callback'ni HAQIQATDAN chaqiradi — lid yozuvi shu ichida bo'lishi kerak.
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    origin = { recordDirectOrigin: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsWriteService,
        { provide: PrismaService, useValue: prisma },
        { provide: StudentLeadOriginService, useValue: origin },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: {} },
        { provide: StatusCascadeService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn() },
        },
        { provide: TransactionsService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentsWriteService);
    jest
      .spyOn(service as any, 'createStudentUser')
      .mockResolvedValue({ plainPassword: 'x' });
  });

  it("DIRECT bo'lsa lid yozuvi tranzaksiya ichida yaratiladi", async () => {
    await service.create(dto, COMPANY, 42, {
      kind: 'DIRECT',
      sourceId: 'src-instagram',
    });

    expect(origin.recordDirectOrigin).toHaveBeenCalledTimes(1);
    const [passedTx, params] = origin.recordDirectOrigin.mock.calls[0];
    expect(passedTx).toBe(tx);
    expect(params).toMatchObject({
      studentId: 555,
      firstName: 'Ali',
      lastName: 'Valiyev',
      phone: '901234567',
      branchId: 7,
      companyId: COMPANY,
      sourceId: 'src-instagram',
      userId: 42,
    });
  });

  it("LEAD bo'lsa ikkinchi lid yozuvi yaratilmaydi", async () => {
    await service.create(dto, COMPANY, 42, {
      kind: 'LEAD',
      leadId: 'lead-1',
    });

    expect(origin.recordDirectOrigin).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishini tasdiqlash**

```bash
cd server && npx jest src/students/students-write.origin.spec.ts
```

Kutilgan: FAIL — `create` 4-parametrni qabul qilmaydi va `recordDirectOrigin`
chaqirilmaydi.

- [ ] **Step 3: `StudentsWriteService` ni o'zgartirish**

`server/src/students/students-write.service.ts` — konstruktorga qo'shing:

```ts
    private leadOrigin: StudentLeadOriginService,
```

Import qo'shing:

```ts
import { StudentLeadOriginService } from './student-lead-origin.service';
import { StudentOrigin } from './student-origin.types';
```

`create` imzosini o'zgartiring (68-qator):

```ts
  async create(
    dto: CreateStudentDto,
    companyId: number,
    userId: number | undefined,
    origin: StudentOrigin,
  ) {
```

Tranzaksiya ichida, `studentBranch.createMany` dan KEYIN va `return` dan OLDIN
(ya'ni `if (dto.branchIds?.length)` bloklari orasida) quyidagini qo'shing:

```ts
        // Har bir o'quvchi lid sifatida tug'iladi. Shu tranzaksiya ichida:
        // lid yozilmasa, o'quvchi ham yozilmaydi.
        if (origin.kind === 'DIRECT') {
          await this.leadOrigin.recordDirectOrigin(tx, {
            studentId: created.id,
            firstName: created.firstName,
            lastName: created.lastName,
            phone: dto.phone,
            branchId: dto.branchIds?.[0] ?? null,
            companyId,
            sourceId: origin.sourceId,
            userId,
          });
        }
```

- [ ] **Step 4: Modulga provider qo'shish**

`server/src/students/students.module.ts` — `providers` massiviga:

```ts
    StudentLeadOriginService,
```

va faylning yuqorisiga import.

- [ ] **Step 5: Testlar o'tishini tasdiqlash**

```bash
cd server && npx jest src/students/students-write.origin.spec.ts
```

Kutilgan: 2 test PASS.

- [ ] **Step 6: Fasad va chaqiruvchilarni o'zgartirish**

`server/src/students/students.service.ts:108`:

```ts
  create(
    dto: CreateStudentDto,
    companyId: number,
    userId: number | undefined,
    origin: StudentOrigin,
  ) {
    return this.write.create(dto, companyId, userId, origin);
  }
```

`server/src/students/dto/create-student-direct.dto.ts` (yangi fayl):

```ts
import { IsNotEmpty, IsString } from 'class-validator';
import { CreateStudentDto } from './create-student.dto';

/**
 * /students eshigining HTTP shartnomasi. `sourceId` shu yerda majburiy, chunki
 * to'g'ridan qo'shilgan o'quvchining manbasi boshqa hech qayerdan bilinmaydi.
 * `LeadsService.convert` ichki chaqiruv bo'lgani uchun oddiy `CreateStudentDto`
 * dan foydalanadi — u yerda manba lidning o'zida saqlangan.
 */
export class CreateStudentDirectDto extends CreateStudentDto {
  @IsString()
  @IsNotEmpty({ message: "«Qayerdan bildi?» maydonini tanlang" })
  sourceId: string;
}
```

`server/src/students/students.controller.ts:92-98`:

```ts
  create(
    @Body() dto: CreateStudentDirectDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentsService.create(dto, companyId, userId, {
      kind: 'DIRECT',
      sourceId: dto.sourceId,
    });
  }
```

`server/src/leads/leads.service.ts:887` — `studentsService.create` chaqiruviga
4-argument qo'shing:

```ts
      const student = await this.studentsService.create(
        {
          firstName: lead.firstName,
          lastName: lead.lastName,
          phone: lead.phone,
          gender: lead.gender ?? undefined,
          telegram: lead.telegram ?? undefined,
          parentPhone: lead.parentPhone ?? undefined,
          parentName: lead.parentName ?? undefined,
          branchIds: resolvedBranchId ? [resolvedBranchId] : undefined,
        },
        companyId,
        userId,
        { kind: 'LEAD', leadId: lead.id },
      );
```

- [ ] **Step 7: Butun server testini va tip tekshiruvini ishga tushirish**

```bash
cd server && npx tsc --noEmit && npx jest
```

Kutilgan: tip xatosi yo'q, hamma test PASS. `create` ni chaqiradigan boshqa joy
qolgan bo'lsa, `tsc` uni aynan shu yerda ushlaydi — bu parametrning majburiy
bo'lishining maqsadi.

- [ ] **Step 8: Commit**

```bash
git add server/src/students server/src/leads/leads.service.ts
git commit -m "O'quvchi yaratishda majburiy origin parametri

/students eshigi endi lid yozuvi qoldiradi; sourceId HTTP darajasida
majburiy. LeadsService.convert LEAD origin bilan chaqiradi, ikkinchi lid
yaratilmaydi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `LOST → CONVERTED` o'tishini ochish

**Files:**
- Modify: `server/src/common/status/status-transitions.ts:54`
- Test: `server/src/common/status/status-transitions.spec.ts` (mavjud bo'lmasa yarating)

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/common/status/status-transitions.spec.ts` fayliga qo'shing (fayl
mavjud bo'lmasa, shu mazmun bilan yarating):

```ts
import { isValidTransition } from './status-transitions';

describe('Lead status transitions', () => {
  /**
   * Yo'qotilgan deb belgilangan odam qaytib kelib ro'yxatdan o'tishi mumkin.
   * Bu taqiqlangan bo'lsa, uning lidi eskicha qolib ketadi va u hisobotda
   * o'quvchiga aylangan sifatida ko'rinmaydi.
   */
  it("yo'qotilgan lid o'quvchiga aylanishi mumkin", () => {
    expect(isValidTransition('Lead', 'LOST', 'CONVERTED')).toBe(true);
  });

  it("o'quvchiga aylangan lid qayta yangi bo'la olmaydi", () => {
    expect(isValidTransition('Lead', 'CONVERTED', 'NEW')).toBe(false);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishini tasdiqlash**

```bash
cd server && npx jest src/common/status/status-transitions.spec.ts
```

Kutilgan: birinchi test FAIL (`false` qaytadi), ikkinchisi PASS.

- [ ] **Step 3: O'tishni qo'shish**

`server/src/common/status/status-transitions.ts:54` — `LOST` qatorini
o'zgartiring:

```ts
    // Qaytib kelgan odam: yo'qotilgan deb belgilangan lid o'quvchiga aylanishi
    // mumkin. To'g'ridan qo'shilgan o'quvchi telefoni bo'yicha eski LOST lidiga
    // bog'lanadi (StudentLeadOriginService), shuning uchun bu o'tish ochiq.
    LOST: ['NEW', 'CONVERTED', 'ARCHIVED'],
```

- [ ] **Step 4: Testlar o'tishini tasdiqlash**

```bash
cd server && npx jest src/common/status/status-transitions.spec.ts
```

Kutilgan: 2 test PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/common/status/status-transitions.ts \
        server/src/common/status/status-transitions.spec.ts
git commit -m "Yo'qotilgan lid o'quvchiga aylanishi mumkin

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: "Qayerdan bildi?" maydoni — `AddStudentDialog`

**Files:**
- Modify: `client/src/lib/schemas/student-schema.ts:52-64`
- Modify: `client/src/components/students/add-student-dialog.tsx`
- Test: `client/src/lib/schemas/student-schema.test.ts` (mavjud bo'lmasa yarating)

**Interfaces:**
- Consumes: `GET /lead-sources` → `{ id: string; name: string }[]`
  (CEO / Branch Director / Administrator uchun ochiq — o'quvchi qo'sha oladigan
  aynan o'sha rollar).
- Produces: `POST /students` tanasiga `sourceId: string` qo'shiladi.

- [ ] **Step 1: Yiqiladigan testni yozish**

`client/src/lib/schemas/student-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addStudentSchema } from "./student-schema";

describe("addStudentSchema", () => {
  const base = {
    firstName: "Ali",
    lastName: "Valiyev",
    phone: "901234567",
  };

  it("manba tanlanmasa rad etadi", () => {
    const result = addStudentSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("manba tanlansa qabul qiladi", () => {
    const result = addStudentSchema.safeParse({
      ...base,
      sourceId: "src-instagram",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishini tasdiqlash**

```bash
cd client && npx vitest run src/lib/schemas/student-schema.test.ts
```

Kutilgan: birinchi test FAIL (manbasiz ham `success: true`).

- [ ] **Step 3: Sxemaga maydon qo'shish**

`client/src/lib/schemas/student-schema.ts:52-64` — `addStudentSchema` ga:

```ts
  // Har bir o'quvchi lid sifatida tug'iladi: to'g'ridan qo'shilgan o'quvchining
  // manbasi boshqa hech qayerdan bilinmaydi, shuning uchun majburiy.
  sourceId: z.string().min(1, "«Qayerdan bildi?» maydonini tanlang"),
```

- [ ] **Step 4: Testlar o'tishini tasdiqlash**

```bash
cd client && npx vitest run src/lib/schemas/student-schema.test.ts
```

Kutilgan: 2 test PASS.

- [ ] **Step 5: Oynaga maydonni qo'shish**

`client/src/components/students/add-student-dialog.tsx`:

Importlarga qo'shing:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

Tip e'lonlari yoniga:

```tsx
interface LeadSourceOption {
  id: string;
  name: string;
}
```

Komponent ichida, `groups` state'i yoniga:

```tsx
  const [sources, setSources] = useState<LeadSourceOption[]>([]);
```

`defaultValues` ga `sourceId: ""` qo'shing.

Manbalarni oyna ochilganda yuklang (mavjud `useEffect(..., [open, form])` yoniga
yangi effekt):

```tsx
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get<LeadSourceOption[]>("/lead-sources")
      .then(({ data }) => {
        if (!cancelled) setSources(data);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);
```

`onSubmit` ichidagi `api.post("/students", {...})` tanasiga qo'shing:

```tsx
        sourceId: values.sourceId,
```

Telefon maydonidan keyin, guruh tanlashdan oldin quyidagi blokni qo'ying:

```tsx
          <div className="space-y-1.5">
            <Label htmlFor="sourceId">
              Qayerdan bildi? <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={form.control}
              name="sourceId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="sourceId">
                    <SelectValue placeholder="Manbani tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.sourceId && (
              <p className="text-sm text-destructive">
                {form.formState.errors.sourceId.message}
              </p>
            )}
          </div>
```

`DialogDescription` matnini yangilang:

```tsx
            Ism, familiya, telefon raqami va o&apos;quvchi markazni qayerdan
            bilganini kiriting. Guruh tanlash ixtiyoriy.
```

- [ ] **Step 6: Qurilishni tekshirish**

```bash
cd client && npx tsc --noEmit && npx next build
```

Kutilgan: tip xatosi yo'q, build muvaffaqiyatli.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/schemas/student-schema.ts \
        client/src/lib/schemas/student-schema.test.ts \
        client/src/components/students/add-student-dialog.tsx
git commit -m "O'quvchi qo'shish oynasiga majburiy manba maydoni

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: "Aylanganlar" ro'yxati — o'quvchi, aylangan sana, sana filtri

**Files:**
- Modify: `server/src/leads/dto/lead-query.dto.ts`
- Modify: `server/src/leads/leads.service.ts:80-163` (`findAll`)
- Modify: `client/src/components/leads/lead-filter-schema.ts`
- Modify: `client/src/components/leads/leads-list.tsx`
- Modify: `client/src/components/leads/leads-filter-bar.tsx`
- Test: `server/src/leads/leads.service.spec.ts` (mavjud faylga qo'shiladi)

**Interfaces:**
- Consumes: yo'q.
- Produces: `findAll` javobidagi har bir element endi `statusChangedAt: Date | null`
  va `convertedStudent: { id: number; firstName: string; lastName: string } | null`
  maydonlarini ham qaytaradi. `LeadQueryDto` ga `dateField?: 'createdAt' | 'statusChangedAt'`
  qo'shiladi (standart `createdAt`). Clientda
  `leadDateFieldIsConversion(holati: readonly string[]): boolean`.

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/leads/leads.service.spec.ts` fayliga yangi `describe` blokini qo'shing
(mavjud `beforeEach` va `prisma` mock'idan foydalaning; agar mock'da
`student.findMany` bo'lmasa, uni `prisma` obyektiga qo'shing):

```ts
describe('LeadsService.findAll — aylanganlar hisoboti', () => {
  it("aylangan lidga o'quvchi ma'lumotini biriktiradi", async () => {
    prisma.lead.findMany.mockResolvedValue([
      {
        id: 'lead-1',
        firstName: 'Ali',
        lastName: 'Valiyev',
        phone: '901234567',
        statusEnum: 'CONVERTED',
        createdAt: new Date('2026-09-01'),
        statusChangedAt: new Date('2026-09-05'),
        convertedStudentId: 555,
        source: null,
        section: null,
      },
    ]);
    prisma.lead.count.mockResolvedValue(1);
    prisma.student.findMany.mockResolvedValue([
      { id: 555, firstName: 'Ali', lastName: 'Valiyev' },
    ]);

    const res = await service.findAll({} as any, 1001, { branchIds: null } as any);

    expect(res.data[0].convertedStudent).toEqual({
      id: 555,
      firstName: 'Ali',
      lastName: 'Valiyev',
    });
  });

  it("dateField=statusChangedAt bo'lsa sana filtri aylangan sanaga tushadi", async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);

    await service.findAll(
      { dateField: 'statusChangedAt', startDate: '2026-09-01' } as any,
      1001,
      { branchIds: null } as any,
    );

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.statusChangedAt).toBeDefined();
    expect(where.createdAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishini tasdiqlash**

```bash
cd server && npx jest src/leads/leads.service.spec.ts -t 'aylanganlar hisoboti'
```

Kutilgan: FAIL — `convertedStudent` yo'q va sana filtri hamisha `createdAt` ga tushadi.

- [ ] **Step 3: DTO ga `dateField` qo'shish**

`server/src/leads/dto/lead-query.dto.ts` — `startDate` dan oldin:

```ts
  /**
   * Sana oralig'i qaysi maydonga tushishi. Standart `createdAt` (lid qachon
   * kelgani). `statusChangedAt` — lid qachon o'quvchiga aylangani; "shu oyda
   * nechta odam o'quvchi bo'ldi" savoliga aynan shu javob beradi.
   */
  @IsOptional()
  @IsIn(['createdAt', 'statusChangedAt'])
  dateField?: 'createdAt' | 'statusChangedAt';
```

`class-validator` importiga `IsIn` qo'shing.

- [ ] **Step 4: `findAll` ni o'zgartirish**

`server/src/leads/leads.service.ts` — `select` blokiga (150-qator atrofida)
qo'shing:

```ts
          statusChangedAt: true,
          convertedStudentId: true,
```

Sana filtri blokini (130-139-qatorlar) almashtiring:

```ts
    if (query.startDate || query.endDate) {
      const range: Prisma.DateTimeFilter = {};
      if (query.startDate) range.gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      if (query.dateField === 'statusChangedAt') {
        where.statusChangedAt = range;
      } else {
        where.createdAt = range;
      }
    }
```

`return` dan oldin o'quvchi ismlarini bitta so'rov bilan olib biriktiring
(`Lead.convertedStudentId` da Prisma relation YO'Q va ataylab qo'shilmaydi —
relation FK constraint va migratsiya talab qiladi):

```ts
    const studentIds = [
      ...new Set(
        data
          .map((l) => l.convertedStudentId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const students = studentIds.length
      ? await this.prisma.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const byId = new Map(students.map((s) => [s.id, s]));

    return {
      data: data.map((l) => ({
        ...l,
        convertedStudent:
          l.convertedStudentId !== null
            ? (byId.get(l.convertedStudentId) ?? null)
            : null,
      })),
      total,
      page,
      pageSize,
    };
```

- [ ] **Step 5: Testlar o'tishini tasdiqlash**

```bash
cd server && npx jest src/leads
```

Kutilgan: hamma test PASS.

- [ ] **Step 6: Ro'yxatga ustunlarni qo'shish**

`client/src/components/leads/leads-list.tsx`:

Lid tipiga (56-qator atrofida) qo'shing:

```tsx
  statusChangedAt: string | null;
  convertedStudent: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
```

`TableHeader` ichiga, "Holati" dan keyin:

```tsx
              <TableHead>O&apos;quvchi</TableHead>
```

va "Sana" dan keyin:

```tsx
              <TableHead>Aylangan sana</TableHead>
```

Qator ichida, "Holati" katakchasidan keyin:

```tsx
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {lead.convertedStudent ? (
                      <Link
                        href={`/students/profile/${lead.convertedStudent.id}`}
                        className="text-primary hover:underline"
                      >
                        {lead.convertedStudent.firstName}{" "}
                        {lead.convertedStudent.lastName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
```

"Sana" katakchasidan keyin:

```tsx
                  <TableCell>
                    {lead.statusChangedAt
                      ? format(parseISO(lead.statusChangedAt), "dd.MM.yyyy")
                      : "—"}
                  </TableCell>
```

Importlarga `import Link from "next/link";` qo'shing.

- [ ] **Step 7: Sana filtrini aylangan sanaga ulash**

So'rov parametrlari filtr panelida emas, `leads-list.tsx` da quriladi.

`client/src/components/leads/lead-filter-schema.ts` — fayl oxiriga yordamchi
funksiya qo'shing (filtr paneli ham, ro'yxat ham shundan foydalanadi, ikkovi
bir-biridan uzoqlashib ketmasligi uchun):

```ts
/**
 * Faqat «O'quvchiga aylangan» tanlangan bo'lsa sana oralig'i lid yaratilgan
 * sanaga emas, AYLANGAN sanaga tushadi — «shu oyda nechta odam o'quvchi bo'ldi»
 * savoliga javob beradigan yagona o'lchov shu. Boshqa har qanday tanlovda
 * (aralash bosqichlar, bo'sh filtr) `createdAt` qoladi.
 */
export function leadDateFieldIsConversion(holati: readonly string[]): boolean {
  return holati.length === 1 && holati[0] === "CONVERTED";
}
```

`client/src/components/leads/leads-list.tsx:93-94` — sana parametrlaridan keyin
qo'shing:

```tsx
      if (leadDateFieldIsConversion(filters.holati)) {
        params.dateField = "statusChangedAt";
      }
```

va 49-qatordagi importni kengaytiring:

```tsx
import {
  LEAD_FILTER_SCHEMA,
  leadDateFieldIsConversion,
  leadHolatiParams,
} from "./lead-filter-schema";
```

`client/src/components/leads/leads-filter-bar.tsx:68` dan keyin qo'shing:

```tsx
  // Sana tanlagichlarining yorlig'i qaysi sana filtrlanayotganini aytib tursin.
  const dateLabel = leadDateFieldIsConversion(filters.holati)
    ? "Aylangan sana"
    : "Sana";
```

va 118 / 128-qatorlardagi `placeholder` larni almashtiring:

```tsx
        placeholder={`${dateLabel}: boshi`}
```

```tsx
        placeholder={`${dateLabel}: oxiri`}
```

Faylga `leadDateFieldIsConversion` importini qo'shing.

- [ ] **Step 8: Qurilishni tekshirish**

```bash
cd client && npx tsc --noEmit && npx next build
```

Kutilgan: tip xatosi yo'q, build muvaffaqiyatli.

- [ ] **Step 9: Commit**

```bash
git add server/src/leads client/src/components/leads
git commit -m "Aylanganlar ro'yxatiga o'quvchi va aylangan sana

Sana filtri CONVERTED tanlanganda statusChangedAt ga tushadi. Prisma
relation qo'shilmadi — migratsiyadan qochish uchun ismlar alohida
so'rov bilan biriktiriladi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: ADR va yakuniy tekshiruv

**Files:**
- Create: `docs/adr/0017-har-bir-oquvchi-lid-sifatida-tugiladi.md`

- [ ] **Step 1: ADR yozish**

`docs/adr/README.md` dagi shaklga amal qiling. Mazmuni:

- **Kontekst:** prodda 936 o'quvchidan 44 tasi lidga bog'langan; `/students`
  eshigi lid qoldirmasdi; konversiya foizi 43/494 ≈ 9 % deb ko'rsatilardi.
- **Qaror:** o'quvchi yaratishga majburiy `origin` union parametri; `DIRECT`
  yo'lida bo'limsiz (`sectionId: null`) lid tranzaksiya ichida yaratiladi yoki
  telefon bo'yicha mavjud lid `CONVERTED` qilinadi.
- **Rad etilgan variantlar:** (1) `/students` tugmasini olib tashlash — adminni
  qayta o'qitish talab qilardi; (2) `EventEmitter2` bilan hodisa — listener xato
  bersa o'quvchi lidsiz qolardi; (3) avtomat lidni tizim bo'limiga tashlash —
  adminning haqiqiy guruh jadvalini ifloslantirardi; (4) `skipLeadOrigin?: boolean`
  bayrog'i — unutilishi mumkin edi.
- **Oqibatlar:** tuzatish sanasidan oldingi davrlar uchun konversiya foizi eskicha
  yolg'on bo'lib qolaveradi (eski 892 ta o'quvchiga ataylab tegilmadi, CEO qarori
  10.09.2026); yangi va eski davrni bitta grafikda taqqoslab bo'lmaydi.

- [ ] **Step 2: To'liq tekshiruv**

```bash
cd server && npx tsc --noEmit && npx jest && npx eslint "src/**/*.ts"
cd ../client && npx tsc --noEmit && npx vitest run && npx next build
```

Kutilgan: hammasi muvaffaqiyatli.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0017-har-bir-oquvchi-lid-sifatida-tugiladi.md
git commit -m "ADR 0017: har bir o'quvchi lid sifatida tug'iladi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Qo'lda tekshirish (deploy'dan oldin)

Bu qadamlar dev muhitda, brauzerda bajariladi:

1. **Yangi manbali o'quvchi:** `/students` → "O'quvchi qo'shish" → manba
   tanlamasdan saqlashga urinish → rad etilishi kerak. Manba tanlab saqlash →
   o'quvchi yaratiladi.
2. **Lid yozuvi paydo bo'lgani:** `/leads` → "Holati" → "O'quvchiga aylangan" →
   yangi o'quvchi ro'yxatda, "Joylashuvi" ustuni `—`, "O'quvchi" ustunida ismi
   va profilga havola, "Aylangan sana" bugungi kun.
3. **Mavjud lid bog'langani:** doskaga lid yarating (masalan `901111111`
   telefoni bilan), keyin `/students` dan aynan shu telefon bilan o'quvchi
   qo'shing → doskadagi kartochka yo'qolishi va "aylanganlar" ro'yxatida o'z
   bo'limi bilan chiqishi kerak.
4. **Ikkilanmaslik:** doskadan "O'quvchiga aylantirish" tugmasi bilan lidni
   aylantiring → "aylanganlar" ro'yxatida shu odam **bitta** marta chiqishi kerak.
5. **Filial:** boshqa filial admini sifatida kiring → yangi lid yozuvi o'z
   filialida ko'rinishi, begona filialda ko'rinmasligi kerak.
