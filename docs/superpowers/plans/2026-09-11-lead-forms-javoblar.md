# Formalar javoblari — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/leads/forms` da har bir formaga kim ro'yxatdan o'tganini, qaysi bosqichda ekanini
ko'rish va qo'ng'iroqni jadvalning o'zida belgilash.

**Architecture:** Server `CustomFormsController` ga ikkita GET route va alohida
`CustomFormSubmissionsService` qo'shiladi; bosqich ta'rifi bitta faylda (`submission-stage.ts`)
yashaydi va filtr/sanoq ham, qator ham shundan foydalanadi. Client'da `/leads/forms/[id]`
javoblar sahifasiga aylanadi, builder `/leads/forms/[id]/tahrirlash` ga ko'chadi, formalar
ro'yxati haqiqiy jadvalga aylanadi. Mavjud `PATCH /leads/:id/called` va
`POST /leads/:id/restore` qayta ishlatiladi. Sxema o'zgarmaydi.

**Tech Stack:** NestJS + Prisma 7 (server, jest), Next.js + shadcn/ui + zustand + date-fns
(client, vitest).

**Spec:** `docs/superpowers/specs/2026-09-11-lead-forms-javoblar-design.md`

## Global Constraints

- Ish joyi: `/Users/a1111/Desktop/daf-erp-system/.worktrees/lid-forma-javoblar`, shox
  `feat/lid-forma-javoblar`. Asosiy katalogda hech narsa yozilmaydi.
- `git add` faqat aniq fayl yo'llari bilan; hech qachon katalog, `-A` yoki `.`.
- UI matni faqat lotin o'zbekchada. UI matnida em-dash (`—`) jumla ichida ishlatilmaydi;
  bo'sh katak belgisi sifatida yolg'iz `—` mumkin (loyiha odati).
- Rangli chap/o'ng chiziq (`border-l-*` > 1px aksent) ishlatilmaydi — kutayotgan qator fon
  va qalin shrift bilan ajraladi.
- Yangi fayl 500 qatordan oshmaydi.
- Telefon ko'rinishi `+998 XX XXX XX XX` (`formatPhone`); sana `dd.MM.yyyy`, vaqt bilan
  `dd.MM.yyyy, HH:mm` (tooltip'da `HH:mm:ss`).
- Har jadvalda `#` ustuni `w-12 border-r`, sahifalash 10/20/30/40/50, sahifa hajmi
  o'zgarsa `page = 1`.
- Har mutatsiya muvaffaqiyat va xato uchun toast ko'rsatadi; xato matni `getErrorMessage`.
- Route'lar `@Roles('CEO', 'Branch Director', 'Administrator')` (class darajasida) va
  `@BranchScope()`; filial qamrovi forma → bo'lim → ustun → `branchIdWhere(scope)`.
- Server buyruqlari `server/` ichidan: `npx jest <yo'l>`, oxirida `npm test`,
  `npm run typecheck`, `npx eslint <fayllar>`. Client buyruqlari `client/` ichidan:
  `npx vitest run <yo'l>`, `npm run typecheck`, `npx eslint <fayllar>`, oxirida `npm run build`.

---

## Fayllar xaritasi

Server (`server/src/custom-forms/`):

| Fayl | Vazifa |
| --- | --- |
| `submission-stage.ts` (yangi) | Bosqich ta'rifi: `submissionStage()` va `stageWhere()` |
| `submission-stage.spec.ts` (yangi) | Ikkalasi barcha kombinatsiyalarda mos kelishi |
| `dto/submission-query.dto.ts` (yangi) | `?stage&source&search&startDate&endDate&page&pageSize` |
| `custom-form-submissions.service.ts` (yangi) | Javoblar ro'yxati, sanoqlar, export |
| `custom-form-submissions.service.spec.ts` (yangi) | Servis testlari |
| `custom-forms.controller.ts` | 2 ta yangi GET route |
| `custom-forms.controller.spec.ts` | Delegatsiya testi |
| `custom-forms.module.ts` | Yangi servis provider |
| `custom-forms.service.ts` | `list()` ga sanoqlar, `findOne()` dan `submissions` olib tashlanadi |
| `custom-forms.service.spec.ts` | `list`/`findOne` testlari |

Client (`client/src/`):

| Fayl | Vazifa |
| --- | --- |
| `components/forms/responses/types.ts` (yangi) | Javob turlari, bosqich nomlari |
| `components/forms/responses/submission-format.ts` (yangi) | Sof funksiyalar: vaqt, CSV, optimistik qo'ng'iroq |
| `components/forms/responses/submission-format.test.ts` (yangi) | vitest |
| `components/forms/responses/use-form-submissions.ts` (yangi) | Yuklash, URL filtrlar, qo'ng'iroq, CSV |
| `components/forms/table-pagination.tsx` (yangi) | Ro'yxat va javoblar uchun umumiy sahifalash |
| `components/forms/responses/stage-chips.tsx` (yangi) | Bosqich chiplari |
| `components/forms/responses/source-breakdown.tsx` (yangi) | Manba taqsimoti (filtr) |
| `components/forms/responses/responses-toolbar.tsx` (yangi) | Qidiruv, sana, mobil «Filtr» |
| `components/forms/responses/submission-cells.tsx` (yangi) | Ism, telefon, vaqt, amallar kataklari |
| `components/forms/responses/call-cell.tsx` (yangi) | «Telefon qildim» |
| `components/forms/responses/responses-table.tsx` (yangi) | Jadval + mobil kartochkalar |
| `components/forms/responses/responses-header.tsx` (yangi) | Sarlavha |
| `components/forms/responses/form-responses-body.tsx` (yangi) | Toolbar + jadval + bo'sh holatlar |
| `components/forms/responses/form-responses-client.tsx` (yangi) | Sahifa: forma, lid kartasi, tiklash |
| `components/leads/restore-lead-dialog.tsx` (yangi) | `leads-archive.tsx` dan ajratilgan dialog |
| `components/leads/leads-archive.tsx` | Ajratilgan dialogni import qiladi |
| `components/forms/forms-list-client.tsx` | Jadval + mobil kartochka |
| `components/forms/form-builder-client.tsx` | Navigatsiya, breadcrumb nomi |
| `hooks/use-custom-forms.ts` | Turlar |
| `app/(dashboard)/leads/forms/[id]/page.tsx` | Javoblar sahifasi |
| `app/(dashboard)/leads/forms/[id]/tahrirlash/page.tsx` (yangi) | Builder |
| `lib/breadcrumb-routes.ts` | `tahrirlash` |

---

### Task 1: Bosqich ta'rifi (server)

**Files:**
- Create: `server/src/custom-forms/submission-stage.ts`
- Test: `server/src/custom-forms/submission-stage.spec.ts`

**Interfaces:**
- Produces:
  - `SUBMISSION_STAGES: readonly ['awaiting', 'contacted', 'converted', 'lost']`
  - `type SubmissionStage`
  - `interface StageLeadFacts { statusEnum: LeadStatus; deletedAt: Date | null; calledAt: Date | null }`
  - `submissionStage(lead: StageLeadFacts | null): SubmissionStage`
  - `stageWhere(stage: SubmissionStage): Prisma.CustomFormSubmissionWhereInput`

- [ ] **Step 1: Failing test yozish**

`server/src/custom-forms/submission-stage.spec.ts`:

```ts
import { LeadStatus, Prisma } from '@prisma/client';
import {
  SUBMISSION_STAGES,
  StageLeadFacts,
  stageWhere,
  submissionStage,
} from './submission-stage';

/**
 * `stageWhere` Prisma'ga ketadi, `submissionStage` xotirada ishlaydi. Ular
 * bir-biriga zid ketsa, chip yonidagi son jadvaldagi qatorlar soniga to'g'ri
 * kelmaydi. Shuning uchun bu yerda `stageWhere` ishlatadigan where'ning kichik
 * to'plami xotirada baholanadi va har bir kombinatsiyada ikkalasi solishtiriladi.
 */
type Row = { leadId: string | null; lead: StageLeadFacts | null };

function matchScalar(cond: unknown, value: unknown): boolean {
  if (cond === null) return value === null;
  if (typeof cond !== 'object') return value === cond;
  const c = cond as Record<string, unknown>;
  if ('not' in c) return c.not === null ? value !== null : value !== c.not;
  if ('in' in c) return (c.in as unknown[]).includes(value);
  if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
  throw new Error(`qo'llab-quvvatlanmagan filtr: ${JSON.stringify(cond)}`);
}

function matchLead(where: Record<string, unknown>, lead: StageLeadFacts): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') {
      return (cond as Record<string, unknown>[]).some((w) => matchLead(w, lead));
    }
    return matchScalar(cond, lead[key as keyof StageLeadFacts]);
  });
}

function matches(where: Prisma.CustomFormSubmissionWhereInput, row: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') {
      return (cond as Prisma.CustomFormSubmissionWhereInput[]).some((w) =>
        matches(w, row),
      );
    }
    if (key === 'leadId') return matchScalar(cond, row.leadId);
    if (key === 'lead') {
      const is = (cond as { is: Record<string, unknown> }).is;
      return row.lead !== null && matchLead(is, row.lead);
    }
    throw new Error(`qo'llab-quvvatlanmagan kalit: ${key}`);
  });
}

const STATUSES = Object.values(LeadStatus);
const SOME_DATE = new Date('2026-09-01T10:00:00Z');

function allRows(): Row[] {
  const rows: Row[] = [{ leadId: null, lead: null }];
  for (const statusEnum of STATUSES) {
    for (const deletedAt of [null, SOME_DATE]) {
      for (const calledAt of [null, SOME_DATE]) {
        rows.push({ leadId: 'lead-1', lead: { statusEnum, deletedAt, calledAt } });
      }
    }
  }
  return rows;
}

describe('submission stage', () => {
  it('har bir kombinatsiya aynan bitta bosqichga tushadi va ikkala ta\'rif mos keladi', () => {
    for (const row of allRows()) {
      const matched = SUBMISSION_STAGES.filter((s) => matches(stageWhere(s), row));
      expect({ row, matched }).toEqual({ row, matched: [submissionStage(row.lead)] });
    }
  });

  it('lid yo\'q bo\'lsa — yo\'qotildi', () => {
    expect(submissionStage(null)).toBe('lost');
  });

  it('o\'quvchiga aylangan lid arxivda bo\'lsa ham — o\'quvchi bo\'ldi', () => {
    expect(
      submissionStage({ statusEnum: 'CONVERTED', deletedAt: SOME_DATE, calledAt: null }),
    ).toBe('converted');
  });

  it('arxivdagi NEW lid — yo\'qotildi, qo\'ng\'iroq qilingan bo\'lsa ham', () => {
    expect(
      submissionStage({ statusEnum: 'NEW', deletedAt: SOME_DATE, calledAt: SOME_DATE }),
    ).toBe('lost');
  });

  it('qo\'ng\'iroq qilingan NEW lid — aloqada', () => {
    expect(
      submissionStage({ statusEnum: 'NEW', deletedAt: null, calledAt: SOME_DATE }),
    ).toBe('contacted');
  });

  it('sinovdagi lid qo\'ng\'iroqsiz ham — aloqada', () => {
    expect(
      submissionStage({ statusEnum: 'TRIAL', deletedAt: null, calledAt: null }),
    ).toBe('contacted');
  });

  it('qo\'ng\'iroq qilinmagan NEW lid — kutmoqda', () => {
    expect(
      submissionStage({ statusEnum: 'NEW', deletedAt: null, calledAt: null }),
    ).toBe('awaiting');
  });
});
```

- [ ] **Step 2: Test yiqilishini ko'rish**

Run: `cd server && npx jest src/custom-forms/submission-stage.spec.ts`
Expected: FAIL — `Cannot find module './submission-stage'`

- [ ] **Step 3: Minimal implementatsiya**

`server/src/custom-forms/submission-stage.ts`:

```ts
import { LeadStatus, Prisma } from '@prisma/client';

/**
 * Formaga kelgan javob qaysi bosqichda — yagona ta'rif.
 *
 * Har bir javob AYNAN bitta bosqichga tushadi va bosqichlar yig'indisi jami
 * javobga teng. Buni ikki joy biladi: `submissionStage` (bitta qator uchun,
 * xotirada) va `stageWhere` (filtr va sanoq uchun, Prisma so'rovida).
 * `submission-stage.spec.ts` ikkalasini barcha kombinatsiyalarda solishtiradi.
 *
 * Ustuvorlik: o'quvchi bo'ldi → yo'qotildi → aloqada → qo'ng'iroq kutmoqda.
 */
export const SUBMISSION_STAGES = [
  'awaiting',
  'contacted',
  'converted',
  'lost',
] as const;

export type SubmissionStage = (typeof SUBMISSION_STAGES)[number];

export interface StageLeadFacts {
  statusEnum: LeadStatus;
  deletedAt: Date | null;
  calledAt: Date | null;
}

const LOST_STATUSES: LeadStatus[] = [LeadStatus.LOST, LeadStatus.ARCHIVED];
const CONTACTED_STATUSES: LeadStatus[] = [LeadStatus.TRIAL, LeadStatus.CONTACTED];

export function submissionStage(lead: StageLeadFacts | null): SubmissionStage {
  // Lid yo'q — CEO uni arxivdan butunlay o'chirgan (optional FK → SetNull).
  if (!lead) return 'lost';
  if (lead.statusEnum === LeadStatus.CONVERTED) return 'converted';
  if (lead.deletedAt !== null || LOST_STATUSES.includes(lead.statusEnum)) {
    return 'lost';
  }
  if (lead.calledAt !== null || CONTACTED_STATUSES.includes(lead.statusEnum)) {
    return 'contacted';
  }
  return 'awaiting';
}

export function stageWhere(
  stage: SubmissionStage,
): Prisma.CustomFormSubmissionWhereInput {
  switch (stage) {
    case 'converted':
      return { lead: { is: { statusEnum: LeadStatus.CONVERTED } } };
    case 'lost':
      return {
        OR: [
          { leadId: null },
          {
            lead: {
              is: {
                statusEnum: { not: LeadStatus.CONVERTED },
                OR: [
                  { deletedAt: { not: null } },
                  { statusEnum: { in: LOST_STATUSES } },
                ],
              },
            },
          },
        ],
      };
    case 'contacted':
      return {
        lead: {
          is: {
            deletedAt: null,
            statusEnum: { notIn: [LeadStatus.CONVERTED, ...LOST_STATUSES] },
            OR: [
              { calledAt: { not: null } },
              { statusEnum: { in: CONTACTED_STATUSES } },
            ],
          },
        },
      };
    case 'awaiting':
      return {
        lead: {
          is: {
            deletedAt: null,
            calledAt: null,
            statusEnum: {
              notIn: [
                LeadStatus.CONVERTED,
                ...LOST_STATUSES,
                ...CONTACTED_STATUSES,
              ],
            },
          },
        },
      };
  }
}
```

- [ ] **Step 4: Test o'tishini ko'rish**

Run: `cd server && npx jest src/custom-forms/submission-stage.spec.ts`
Expected: PASS (7 test)

- [ ] **Step 5: Prettier + lint**

Run: `cd server && npx prettier --write src/custom-forms/submission-stage.ts src/custom-forms/submission-stage.spec.ts && npx eslint src/custom-forms/submission-stage.ts src/custom-forms/submission-stage.spec.ts`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add server/src/custom-forms/submission-stage.ts server/src/custom-forms/submission-stage.spec.ts
git commit -m "Forma javobi bosqichining yagona ta'rifi"
```

---

### Task 2: Javoblar servisi (server)

**Files:**
- Create: `server/src/custom-forms/dto/submission-query.dto.ts`
- Create: `server/src/custom-forms/custom-form-submissions.service.ts`
- Test: `server/src/custom-forms/custom-form-submissions.service.spec.ts`

**Interfaces:**
- Consumes: `SUBMISSION_STAGES`, `SubmissionStage`, `stageWhere`, `submissionStage` (Task 1)
- Produces:
  - `NO_SOURCE_TOKEN = 'none'`, `class SubmissionQueryDto extends PaginationDto { stage?; source?: string[]; search?; startDate?; endDate? }`
  - `CustomFormSubmissionsService.list(formId: string, query: SubmissionQueryDto, companyId: number, scope: ReportBranchIds)` → `{ data: SubmissionRow[]; total; page; pageSize; counts: { stages: Record<SubmissionStage, number>; sources: { id: string | null; name: string | null; count: number }[] }; fields: SubmissionFieldColumn[]; legacyFields: { id: string; label: string }[] }`
  - `CustomFormSubmissionsService.export(formId, query, companyId, scope)` → `{ data: SubmissionRow[]; fields; legacyFields }`
  - `SubmissionRow = { id; submittedAt: Date; data: Record<string, string|number|boolean>; stage; isRepeat: boolean; submitted: { firstName; lastName; phone }; lead: { id; firstName; lastName; phone; statusEnum; archived: boolean; calledAt: Date|null; calledBy: {id;firstName;lastName}|null; convertedStudentId: number|null; lostReason: string|null; source: {id;name}|null } | null }`

- [ ] **Step 1: DTO yozish**

`server/src/custom-forms/dto/submission-query.dto.ts`:

```ts
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toStringArray } from '../../common/dto/to-array';
import { SUBMISSION_STAGES, SubmissionStage } from '../submission-stage';

/** `?source=` da manbasi yo'q javoblarni bildiradigan belgi. */
export const NO_SOURCE_TOKEN = 'none';

export class SubmissionQueryDto extends PaginationDto {
  // Bosqichlar bir-birini qoplamaydi — ko'p tanlash "hammasi" bilan bir xil
  // bo'lib qolardi, shuning uchun bitta qiymat.
  @IsOptional()
  @IsIn(SUBMISSION_STAGES)
  stage?: SubmissionStage;

  // Manba id'lari vergul bilan; `none` = manbasi yo'q.
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  source?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  // `submittedAt` oralig'i, Toshkent kuni bo'yicha (yyyy-MM-dd).
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
```

- [ ] **Step 2: Failing test yozish**

`server/src/custom-forms/custom-form-submissions.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LEAD_LINKED_REASON } from '../leads/leads.service';
import { CustomFormSubmissionsService } from './custom-form-submissions.service';
import { SubmissionQueryDto } from './dto/submission-query.dto';
import { SUBMISSION_STAGES, stageWhere } from './submission-stage';

const FORM_FIELDS = [
  { id: 'fn', type: 'text', label: 'Ism', required: true, mapsTo: 'firstName' },
  { id: 'ln', type: 'text', label: 'Familya', required: true, mapsTo: 'lastName' },
  { id: 'ph', type: 'phone', label: 'Telefon', required: true, mapsTo: 'phone' },
  {
    id: 'lvl',
    type: 'select',
    label: 'Daraja',
    required: false,
    options: [{ value: 'a1', label: 'A1' }],
  },
];

function makeLead(over: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    statusEnum: 'NEW',
    deletedAt: null,
    calledAt: null,
    createdAt: new Date('2026-09-10T09:00:00Z'),
    convertedStudentId: null,
    lostReason: null,
    statusChangeReason: null,
    calledBy: null,
    source: { id: 'src-ig', name: 'Instagram' },
    ...over,
  };
}

function makeRecord(over: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    submittedAt: new Date('2026-09-10T09:00:00Z'),
    data: { fn: 'Ali', ln: 'Valiyev', ph: '901234567', lvl: 'a1' },
    lead: makeLead(),
    ...over,
  };
}

const query = (q: Partial<SubmissionQueryDto> = {}) => q as SubmissionQueryDto;

describe('CustomFormSubmissionsService', () => {
  let service: CustomFormSubmissionsService;
  let prisma: any;

  /** Birinchi `findMany` (id bilan) — sahifa qatorlari; ikkinchisi (faqat data) — eski maydonlar skani. */
  function givenRecords(records: unknown[], allData?: unknown[]) {
    prisma.customFormSubmission.findMany.mockImplementation(
      (args: { select: Record<string, unknown> }) =>
        Promise.resolve(
          args.select.id
            ? records
            : (allData ?? records.map((r: any) => ({ data: r.data }))),
        ),
    );
  }

  beforeEach(async () => {
    prisma = {
      customForm: {
        findFirst: jest.fn().mockResolvedValue({ id: 'form-1', fields: FORM_FIELDS }),
      },
      customFormSubmission: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      lead: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      leadSource: { findMany: jest.fn().mockResolvedValue([]) },
    };
    givenRecords([]);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFormSubmissionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CustomFormSubmissionsService);
  });

  it('forma chaqiruvchi filialiga tegishli bo\'lmasa 404', async () => {
    prisma.customForm.findFirst.mockResolvedValue(null);
    await expect(service.list('form-1', query(), 1, [3])).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.customForm.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'form-1',
          companyId: 1,
          deletedAt: null,
          section: { column: { branchId: { in: [3] } } },
        }),
      }),
    );
  });

  it('qatorni bosqich, sabab va javoblar bilan qaytaradi', async () => {
    givenRecords([
      makeRecord(),
      makeRecord({
        id: 'sub-2',
        lead: makeLead({
          id: 'lead-2',
          statusEnum: 'LOST',
          deletedAt: new Date('2026-09-11T00:00:00Z'),
          lostReason: 'qimmat',
        }),
      }),
    ]);
    const result = await service.list('form-1', query(), 1, null);

    expect(result.data[0]).toMatchObject({
      id: 'sub-1',
      stage: 'awaiting',
      data: { lvl: 'a1' },
      submitted: { firstName: 'Ali', lastName: 'Valiyev', phone: '901234567' },
      lead: { id: 'lead-1', archived: false, lostReason: null },
    });
    expect(result.data[1]).toMatchObject({
      stage: 'lost',
      lead: { archived: true, lostReason: 'qimmat' },
    });
    expect(result.fields).toEqual([
      { id: 'lvl', label: 'Daraja', type: 'select', options: [{ value: 'a1', label: 'A1' }] },
    ]);
  });

  it('CONVERTED sentinel hech qachon yo\'qotish sababi bo\'lib chiqmaydi', async () => {
    givenRecords([
      makeRecord({
        lead: makeLead({ statusEnum: 'CONVERTED', statusChangeReason: LEAD_LINKED_REASON }),
      }),
    ]);
    const result = await service.list('form-1', query(), 1, null);
    expect(result.data[0]).toMatchObject({ stage: 'converted', lead: { lostReason: null } });
  });

  it('lid butunlay o\'chirilgan bo\'lsa — yo\'qotildi, ism formadagi javobdan', async () => {
    givenRecords([makeRecord({ lead: null })]);
    const result = await service.list('form-1', query(), 1, null);
    expect(result.data[0]).toMatchObject({
      stage: 'lost',
      lead: null,
      isRepeat: false,
      submitted: { firstName: 'Ali', lastName: 'Valiyev', phone: '901234567' },
    });
  });

  it('javobdagi primitiv bo\'lmagan qiymatlarni tashlab yuboradi', async () => {
    givenRecords([makeRecord({ data: { fn: 'Ali', bad: { x: 1 }, ok: true } })]);
    const result = await service.list('form-1', query(), 1, null);
    expect(result.data[0].data).toEqual({ fn: 'Ali', ok: true });
  });

  describe('isRepeat', () => {
    it('telefon oldinroq boshqa lidda asosiy yoki qo\'shimcha raqam bo\'lsa — takroriy', async () => {
      givenRecords([
        makeRecord(),
        makeRecord({
          id: 'sub-2',
          lead: makeLead({ id: 'lead-2', phone: '931112233' }),
        }),
        makeRecord({
          id: 'sub-3',
          lead: makeLead({ id: 'lead-3', phone: '977778899' }),
        }),
      ]);
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1', phone: '901234567', extraPhone: null, createdAt: new Date('2026-09-10T09:00:00Z') },
        { id: 'old-a', phone: '901234567', extraPhone: null, createdAt: new Date('2026-08-01T00:00:00Z') },
        { id: 'old-b', phone: '000000000', extraPhone: '931112233', createdAt: new Date('2026-08-01T00:00:00Z') },
        { id: 'new-c', phone: '977778899', extraPhone: null, createdAt: new Date('2026-09-11T00:00:00Z') },
      ]);

      const result = await service.list('form-1', query(), 1, null);

      expect(result.data.map((r) => r.isRepeat)).toEqual([true, true, false]);
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1,
            OR: [
              { phone: { in: ['901234567', '931112233', '977778899'] } },
              { extraPhone: { in: ['901234567', '931112233', '977778899'] } },
            ],
          },
        }),
      );
    });
  });

  describe('sanoqlar', () => {
    it('bosqich sanoqlari butun forma bo\'yicha, joriy filtrga qaramaydi', async () => {
      const totals = { awaiting: 17, contacted: 0, converted: 6, lost: 22 };
      prisma.customFormSubmission.count.mockImplementation(
        ({ where }: { where: any }) => {
          for (const s of SUBMISSION_STAGES) {
            if (JSON.stringify(where) === JSON.stringify({ formId: 'form-1', AND: [stageWhere(s)] })) {
              return Promise.resolve(totals[s]);
            }
          }
          return Promise.resolve(0);
        },
      );

      const result = await service.list('form-1', query({ stage: 'lost', search: 'Ali' }), 1, null);

      expect(result.counts.stages).toEqual(totals);
    });

    it('manbalar kamayish tartibida; manbasiz lid va lidsiz javob bitta guruhda', async () => {
      prisma.lead.groupBy.mockResolvedValue([
        { sourceId: 'src-tg', _count: { _all: 12 } },
        { sourceId: 'src-ig', _count: { _all: 30 } },
        { sourceId: null, _count: { _all: 2 } },
      ]);
      prisma.leadSource.findMany.mockResolvedValue([
        { id: 'src-ig', name: 'Instagram' },
        { id: 'src-tg', name: 'Telegram' },
      ]);
      prisma.customFormSubmission.count.mockImplementation(
        ({ where }: { where: any }) =>
          Promise.resolve(where.leadId === null && !where.AND ? 1 : 0),
      );

      const result = await service.list('form-1', query(), 1, null);

      expect(result.counts.sources).toEqual([
        { id: 'src-ig', name: 'Instagram', count: 30 },
        { id: 'src-tg', name: 'Telegram', count: 12 },
        { id: null, name: null, count: 3 },
      ]);
    });
  });

  describe('filtrlar', () => {
    const whereOfPage = () =>
      prisma.customFormSubmission.findMany.mock.calls.find(
        ([args]: [any]) => args.select.id,
      )[0].where;

    it('bosqich, manba (none bilan), qidiruv va sana oralig\'ini birlashtiradi', async () => {
      await service.list(
        'form-1',
        query({
          stage: 'awaiting',
          source: ['src-ig', 'none'],
          search: 'Ali 90',
          startDate: '2026-09-01',
          endDate: '2026-09-10',
        }),
        1,
        null,
      );

      const where = whereOfPage();
      expect(where.formId).toBe('form-1');
      expect(where.submittedAt).toEqual({
        gte: expect.any(Date),
        lt: expect.any(Date),
      });
      expect(where.AND).toEqual([
        stageWhere('awaiting'),
        {
          OR: [
            { lead: { is: { sourceId: { in: ['src-ig'] } } } },
            { leadId: null },
            { lead: { is: { sourceId: null } } },
          ],
        },
        {
          lead: {
            is: {
              OR: [
                { firstName: { contains: 'Ali', mode: 'insensitive' } },
                { lastName: { contains: 'Ali', mode: 'insensitive' } },
              ],
            },
          },
        },
        {
          lead: {
            is: {
              OR: [
                { firstName: { contains: '90', mode: 'insensitive' } },
                { lastName: { contains: '90', mode: 'insensitive' } },
                { phone: { contains: '90' } },
              ],
            },
          },
        },
      ]);
    });

    it('filtrsiz so\'rovda AND yo\'q, eng yangisi tepada, sahifa hisoblanadi', async () => {
      await service.list('form-1', query({ page: 3, pageSize: 20 }), 1, null);
      const call = prisma.customFormSubmission.findMany.mock.calls.find(
        ([args]: [any]) => args.select.id,
      )[0];
      expect(call.where).toEqual({ formId: 'form-1' });
      expect(call).toMatchObject({ orderBy: { submittedAt: 'desc' }, skip: 40, take: 20 });
    });
  });

  it('formadan o\'chirilgan maydonlarning javoblari legacyFields bo\'lib chiqadi', async () => {
    givenRecords([], [
      { data: { fn: 'A', old1: 'x' } },
      { data: { fn: 'B', old1: 'y', old2: true } },
    ]);
    const result = await service.list('form-1', query(), 1, null);
    expect(result.legacyFields).toEqual([
      { id: 'old1', label: "O'chirilgan maydon 1" },
      { id: 'old2', label: "O'chirilgan maydon 2" },
    ]);
  });

  it('export sahifasiz, eng ko\'pi 5000 qator', async () => {
    givenRecords([makeRecord()]);
    const result = await service.export('form-1', query({ page: 2 }), 1, null);
    const call = prisma.customFormSubmission.findMany.mock.calls.find(
      ([args]: [any]) => args.select.id,
    )[0];
    expect(call.take).toBe(5000);
    expect(call.skip).toBeUndefined();
    expect(result.data).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Test yiqilishini ko'rish**

Run: `cd server && npx jest src/custom-forms/custom-form-submissions.service.spec.ts`
Expected: FAIL — `Cannot find module './custom-form-submissions.service'`

- [ ] **Step 4: Servisni yozish**

`server/src/custom-forms/custom-form-submissions.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';
import { tashkentRangeFilter } from '../common/date/tashkent';
import { LEAD_LINKED_REASON } from '../leads/leads.service';
import { FormFieldDto, MapsToValue } from './dto/form-field.dto';
import {
  NO_SOURCE_TOKEN,
  SubmissionQueryDto,
} from './dto/submission-query.dto';
import {
  SUBMISSION_STAGES,
  SubmissionStage,
  stageWhere,
  submissionStage,
} from './submission-stage';

/** CSV bitta so'rovda shundan ortiq qatorni olib kelmaydi. */
const EXPORT_LIMIT = 5000;

const ROW_SELECT = {
  id: true,
  submittedAt: true,
  data: true,
  lead: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      statusEnum: true,
      deletedAt: true,
      calledAt: true,
      createdAt: true,
      convertedStudentId: true,
      lostReason: true,
      statusChangeReason: true,
      calledBy: { select: { id: true, firstName: true, lastName: true } },
      source: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.CustomFormSubmissionSelect;

type SubmissionRecord = Prisma.CustomFormSubmissionGetPayload<{
  select: typeof ROW_SELECT;
}>;
type RecordLead = NonNullable<SubmissionRecord['lead']>;

export type AnswerValue = string | number | boolean;

export interface SubmissionFieldColumn {
  id: string;
  label: string;
  type: FormFieldDto['type'];
  options?: { value: string; label: string }[];
}

export interface SubmissionRow {
  id: string;
  submittedAt: Date;
  data: Record<string, AnswerValue>;
  stage: SubmissionStage;
  isRepeat: boolean;
  /** Formaga yozilgan ism/telefon — lid butunlay o'chirilgan bo'lsa ham qoladi. */
  submitted: { firstName: string; lastName: string; phone: string };
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    statusEnum: RecordLead['statusEnum'];
    archived: boolean;
    calledAt: Date | null;
    calledBy: RecordLead['calledBy'];
    convertedStudentId: number | null;
    lostReason: string | null;
    source: RecordLead['source'];
  } | null;
}

interface ScopedForm {
  allFields: FormFieldDto[];
  /** Jadvalda alohida ustun bo'ladiganlari — ism/familiya/telefondan tashqari. */
  columns: SubmissionFieldColumn[];
}

/**
 * Bitta formaga kelgan javoblar: kim yozildi, qaysi bosqichda, qayerdan keldi.
 *
 * Bosqich `submission-stage.ts` dan olinadi — sanoq ham, filtr ham, qator ham
 * shu bitta ta'rifdan foydalanadi, shuning uchun chip yonidagi son bilan
 * jadvaldagi qatorlar soni ajralib ketmaydi.
 */
@Injectable()
export class CustomFormSubmissionsService {
  constructor(private prisma: PrismaService) {}

  async list(
    formId: string,
    query: SubmissionQueryDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const form = await this.findScopedForm(formId, companyId, scope);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = this.buildWhere(formId, query);

    const [records, total, counts, legacyFields] = await Promise.all([
      this.prisma.customFormSubmission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ROW_SELECT,
      }),
      this.prisma.customFormSubmission.count({ where }),
      this.countForm(formId),
      this.findLegacyFields(formId, form.allFields),
    ]);

    return {
      data: await this.toRows(records, form.allFields, companyId),
      total,
      page,
      pageSize,
      counts,
      fields: form.columns,
      legacyFields,
    };
  }

  async export(
    formId: string,
    query: SubmissionQueryDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const form = await this.findScopedForm(formId, companyId, scope);
    const [records, legacyFields] = await Promise.all([
      this.prisma.customFormSubmission.findMany({
        where: this.buildWhere(formId, query),
        orderBy: { submittedAt: 'desc' },
        take: EXPORT_LIMIT,
        select: ROW_SELECT,
      }),
      this.findLegacyFields(formId, form.allFields),
    ]);
    return {
      data: await this.toRows(records, form.allFields, companyId),
      fields: form.columns,
      legacyFields,
    };
  }

  /** Forma bo'limi → ustun → filial zanjiri `findOne` dagi bilan bir xil. */
  private async findScopedForm(
    formId: string,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<ScopedForm> {
    const form = await this.prisma.customForm.findFirst({
      where: {
        id: formId,
        companyId,
        deletedAt: null,
        section: { column: { ...branchIdWhere(scope) } },
      },
      select: { id: true, fields: true },
    });
    if (!form) {
      throw new NotFoundException('Forma topilmadi');
    }
    const allFields = Array.isArray(form.fields)
      ? (form.fields as unknown as FormFieldDto[])
      : [];
    return {
      allFields,
      columns: allFields
        .filter((f) => !f.mapsTo)
        .map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          ...(f.options ? { options: f.options } : {}),
        })),
    };
  }

  private buildWhere(
    formId: string,
    query: SubmissionQueryDto,
  ): Prisma.CustomFormSubmissionWhereInput {
    const and: Prisma.CustomFormSubmissionWhereInput[] = [];

    if (query.stage) and.push(stageWhere(query.stage));

    if (query.source?.length) {
      const ids = query.source.filter((s) => s !== NO_SOURCE_TOKEN);
      const or: Prisma.CustomFormSubmissionWhereInput[] = [];
      if (ids.length) or.push({ lead: { is: { sourceId: { in: ids } } } });
      if (query.source.includes(NO_SOURCE_TOKEN)) {
        or.push({ leadId: null }, { lead: { is: { sourceId: null } } });
      }
      and.push({ OR: or });
    }

    // Har bir so'z ism, familiya yoki telefonda bo'lishi kerak — «Ali Valiyev»
    // ikkala so'z bo'yicha topiladi.
    const tokens = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    for (const token of tokens) {
      const or: Prisma.LeadWhereInput[] = [
        { firstName: { contains: token, mode: 'insensitive' } },
        { lastName: { contains: token, mode: 'insensitive' } },
      ];
      const digits = token.replace(/\D/g, '');
      if (digits.length >= 2) or.push({ phone: { contains: digits } });
      and.push({ lead: { is: { OR: or } } });
    }

    const range = tashkentRangeFilter(query.startDate, query.endDate);
    return {
      formId,
      ...(range ? { submittedAt: range } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  /** Chip va manba sonlari — doim butun forma bo'yicha, filtrga qaramaydi. */
  private async countForm(formId: string) {
    const [stageTotals, bySource, leadless] = await Promise.all([
      Promise.all(
        SUBMISSION_STAGES.map((stage) =>
          this.prisma.customFormSubmission.count({
            where: { formId, AND: [stageWhere(stage)] },
          }),
        ),
      ),
      this.prisma.lead.groupBy({
        by: ['sourceId'],
        where: { formSubmissions: { some: { formId } } },
        _count: { _all: true },
      }),
      this.prisma.customFormSubmission.count({
        where: { formId, leadId: null },
      }),
    ]);

    const stages = Object.fromEntries(
      SUBMISSION_STAGES.map((stage, i) => [stage, stageTotals[i]]),
    ) as Record<SubmissionStage, number>;

    const sourceIds = bySource.flatMap((g) => (g.sourceId ? [g.sourceId] : []));
    const names = sourceIds.length
      ? await this.prisma.leadSource.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(names.map((s) => [s.id, s.name]));

    const sources: { id: string | null; name: string | null; count: number }[] =
      [];
    let unsourced = leadless;
    for (const group of bySource) {
      if (group.sourceId) {
        sources.push({
          id: group.sourceId,
          name: nameById.get(group.sourceId) ?? "Noma'lum manba",
          count: group._count._all,
        });
      } else {
        unsourced += group._count._all;
      }
    }
    if (unsourced > 0) sources.push({ id: null, name: null, count: unsourced });
    sources.sort((a, b) => b.count - a.count);

    return { stages, sources };
  }

  /**
   * Formadan o'chirilgan maydonlarning eski javoblari yo'qolmasin. Nomi endi
   * `CustomForm.fields` da yo'q, shuning uchun raqamlangan umumiy nom.
   */
  private async findLegacyFields(formId: string, allFields: FormFieldDto[]) {
    const known = new Set(allFields.map((f) => f.id));
    const records = await this.prisma.customFormSubmission.findMany({
      where: { formId },
      select: { data: true },
    });
    const legacy: string[] = [];
    for (const { data } of records) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      for (const key of Object.keys(data)) {
        if (!known.has(key) && !legacy.includes(key)) legacy.push(key);
      }
    }
    return legacy.map((id, i) => ({
      id,
      label:
        legacy.length === 1 ? "O'chirilgan maydon" : `O'chirilgan maydon ${i + 1}`,
    }));
  }

  private async toRows(
    records: SubmissionRecord[],
    allFields: FormFieldDto[],
    companyId: number,
  ): Promise<SubmissionRow[]> {
    const repeatLeadIds = await this.findRepeatLeadIds(
      records.flatMap((r) => (r.lead ? [r.lead] : [])),
      companyId,
    );
    return records.map((record) => {
      const stage = submissionStage(record.lead);
      const data = toAnswers(record.data);
      const lead = record.lead;
      return {
        id: record.id,
        submittedAt: record.submittedAt,
        data,
        stage,
        isRepeat: lead ? repeatLeadIds.has(lead.id) : false,
        submitted: mappedAnswers(allFields, data),
        lead: lead
          ? {
              id: lead.id,
              firstName: lead.firstName,
              lastName: lead.lastName,
              phone: lead.phone,
              statusEnum: lead.statusEnum,
              archived: lead.deletedAt !== null,
              calledAt: lead.calledAt,
              calledBy: lead.calledBy,
              convertedStudentId: lead.convertedStudentId,
              lostReason: stage === 'lost' ? lostReasonOf(lead) : null,
              source: lead.source,
            }
          : null,
      };
    });
  }

  /**
   * Shu telefon bu liddan OLDIN boshqa lidda asosiy yoki qo'shimcha raqam
   * sifatida bo'lganmi. Faqat belgi — lid yaratish mantig'i o'zgarmaydi.
   */
  private async findRepeatLeadIds(
    leads: { id: string; phone: string; createdAt: Date }[],
    companyId: number,
  ): Promise<Set<string>> {
    const phones = [...new Set(leads.map((l) => l.phone).filter(Boolean))];
    if (!phones.length) return new Set();
    const others = await this.prisma.lead.findMany({
      where: {
        companyId,
        OR: [{ phone: { in: phones } }, { extraPhone: { in: phones } }],
      },
      select: { id: true, phone: true, extraPhone: true, createdAt: true },
    });
    const repeat = new Set<string>();
    for (const lead of leads) {
      const earlier = others.some(
        (o) =>
          o.id !== lead.id &&
          o.createdAt < lead.createdAt &&
          (o.phone === lead.phone || o.extraPhone === lead.phone),
      );
      if (earlier) repeat.add(lead.id);
    }
    return repeat;
  }
}

function toAnswers(raw: Prisma.JsonValue): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }
  return out;
}

function mappedAnswers(
  fields: FormFieldDto[],
  data: Record<string, AnswerValue>,
): SubmissionRow['submitted'] {
  const pick = (slot: MapsToValue) => {
    const field = fields.find((f) => f.mapsTo === slot);
    const value = field ? data[field.id] : undefined;
    return value === undefined ? '' : String(value);
  };
  return {
    firstName: pick('firstName'),
    lastName: pick('lastName'),
    phone: pick('phone'),
  };
}

function lostReasonOf(lead: RecordLead): string | null {
  if (lead.lostReason) return lead.lostReason;
  const reason = lead.statusChangeReason;
  return reason && reason !== LEAD_LINKED_REASON ? reason : null;
}
```

- [ ] **Step 5: Test o'tishini ko'rish**

Run: `cd server && npx jest src/custom-forms/custom-form-submissions.service.spec.ts`
Expected: PASS (13 test)

- [ ] **Step 6: Prettier + lint + typecheck**

Run: `cd server && npx prettier --write src/custom-forms/custom-form-submissions.service.ts src/custom-forms/custom-form-submissions.service.spec.ts src/custom-forms/dto/submission-query.dto.ts && npx eslint src/custom-forms/custom-form-submissions.service.ts src/custom-forms/custom-form-submissions.service.spec.ts src/custom-forms/dto/submission-query.dto.ts && npm run typecheck`
Expected: 0 errors (warning'lar blok qilmaydi)

- [ ] **Step 7: Commit**

```bash
git add server/src/custom-forms/dto/submission-query.dto.ts server/src/custom-forms/custom-form-submissions.service.ts server/src/custom-forms/custom-form-submissions.service.spec.ts
git commit -m "Forma javoblari servisi: ro'yxat, sanoqlar, export"
```

---

### Task 3: Controller route'lari (server)

**Files:**
- Modify: `server/src/custom-forms/custom-forms.controller.ts`
- Modify: `server/src/custom-forms/custom-forms.module.ts`
- Test: `server/src/custom-forms/custom-forms.controller.spec.ts`

**Interfaces:**
- Consumes: `CustomFormSubmissionsService.list/export`, `SubmissionQueryDto` (Task 2)
- Produces: `GET /api/custom-forms/:id/submissions`, `GET /api/custom-forms/:id/submissions/export`

- [ ] **Step 1: Failing test yozish**

`server/src/custom-forms/custom-forms.controller.spec.ts` ga `describe` ichiga, mavjud testlardan keyin qo'shing:

```ts
  it('javoblar route\'larini javoblar servisiga uzatadi', async () => {
    const submissions = {
      list: jest.fn().mockResolvedValue('LIST'),
      export: jest.fn().mockResolvedValue('EXPORT'),
    };
    const controller = new CustomFormsController(
      {} as never,
      submissions as never,
    );
    const query = { page: 2 } as never;

    await expect(controller.listSubmissions('f1', query, 7, [3])).resolves.toBe('LIST');
    expect(submissions.list).toHaveBeenCalledWith('f1', query, 7, [3]);

    await expect(controller.exportSubmissions('f1', query, 7, null)).resolves.toBe('EXPORT');
    expect(submissions.export).toHaveBeenCalledWith('f1', query, 7, null);
  });

  it('javoblar route\'larida metod darajasidagi rol almashtirilmagan', () => {
    for (const handler of [
      CustomFormsController.prototype.listSubmissions,
      CustomFormsController.prototype.exportSubmissions,
    ]) {
      expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
    }
  });
```

- [ ] **Step 2: Test yiqilishini ko'rish**

Run: `cd server && npx jest src/custom-forms/custom-forms.controller.spec.ts`
Expected: FAIL — `controller.listSubmissions is not a function` (yoki TS xatosi)

- [ ] **Step 3: Controller va modul**

`server/src/custom-forms/custom-forms.controller.ts` — importlarga `Query` qo'shing va yangi importlar:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CustomFormsService } from './custom-forms.service';
import { CustomFormSubmissionsService } from './custom-form-submissions.service';
import { CreateCustomFormDto } from './dto/create-custom-form.dto';
import { UpdateCustomFormDto } from './dto/update-custom-form.dto';
import { SubmissionQueryDto } from './dto/submission-query.dto';
```

Konstruktorni almashtiring:

```ts
  constructor(
    private readonly service: CustomFormsService,
    private readonly submissions: CustomFormSubmissionsService,
  ) {}
```

`findOne` metodidan keyin qo'shing:

```ts
  @Get(':id/submissions')
  listSubmissions(
    @Param('id') id: string,
    @Query() query: SubmissionQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.submissions.list(id, query, companyId, scope);
  }

  @Get(':id/submissions/export')
  exportSubmissions(
    @Param('id') id: string,
    @Query() query: SubmissionQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.submissions.export(id, query, companyId, scope);
  }
```

`server/src/custom-forms/custom-forms.module.ts`:

```ts
import { CustomFormsService } from './custom-forms.service';
import { CustomFormSubmissionsService } from './custom-form-submissions.service';
```

va `providers: [CustomFormsService, CustomFormSubmissionsService],`

- [ ] **Step 4: Test o'tishini ko'rish (manifest bilan)**

Run: `cd server && npx jest src/custom-forms src/common/auth/branch-route-policy.spec.ts`
Expected: PASS. Route siyosati manifesti yangi route'larni `@BranchScope()` orqali tan oladi —
agar u yiqilsa, xato matnidagi route kalitini o'qing: `@BranchScope()` dekoratori yo'qolgan
bo'ladi.

- [ ] **Step 5: Prettier + lint**

Run: `cd server && npx prettier --write src/custom-forms/custom-forms.controller.ts src/custom-forms/custom-forms.controller.spec.ts src/custom-forms/custom-forms.module.ts && npx eslint src/custom-forms/custom-forms.controller.ts src/custom-forms/custom-forms.controller.spec.ts src/custom-forms/custom-forms.module.ts`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add server/src/custom-forms/custom-forms.controller.ts server/src/custom-forms/custom-forms.controller.spec.ts server/src/custom-forms/custom-forms.module.ts
git commit -m "Forma javoblari route'lari"
```

---

### Task 4: Formalar ro'yxati sanoqlari va findOne tozalash (server)

**Files:**
- Modify: `server/src/custom-forms/custom-forms.service.ts:60-136`
- Test: `server/src/custom-forms/custom-forms.service.spec.ts`

**Interfaces:**
- Consumes: `stageWhere` (Task 1)
- Produces: `GET /custom-forms` har bir formaga `lastSubmittedAt: Date | null`, `convertedCount: number`, `awaitingCallCount: number` qo'shadi; `GET /custom-forms/:id` endi `submissions` qaytarmaydi.

- [ ] **Step 1: Failing test yozish**

`custom-forms.service.spec.ts` dagi `prisma` mock'iga `customFormSubmission` ichiga `groupBy: jest.fn().mockResolvedValue([])` qo'shing:

```ts
      customFormSubmission: {
        create: jest.fn().mockResolvedValue({ id: 'sub-1' }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
```

Fayl oxiridagi eng tashqi `describe` ichiga qo'shing:

```ts
  describe('list', () => {
    const baseForm = (id: string, submissions: number) => ({
      id,
      slug: `slug-${id}`,
      title: `Forma ${id}`,
      isActive: true,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      section: { id: 'sec-1', name: 'Bo\'lim', column: { id: 'col-1', name: 'Ustun' } },
      source: null,
      _count: { submissions },
    });

    it('har formaga oxirgi javob vaqti, o\'quvchi bo\'lganlar va qo\'ng\'iroq kutayotganlar sonini qo\'shadi', async () => {
      prisma.customForm.findMany.mockResolvedValue([baseForm('f1', 3), baseForm('f2', 0)]);
      const last = new Date('2026-09-10T09:00:00Z');
      prisma.customFormSubmission.groupBy
        .mockResolvedValueOnce([{ formId: 'f1', _max: { submittedAt: last } }])
        .mockResolvedValueOnce([{ formId: 'f1', _count: { _all: 1 } }])
        .mockResolvedValueOnce([{ formId: 'f1', _count: { _all: 2 } }]);

      const result = await service.list(1, null);

      expect(result[0]).toMatchObject({
        id: 'f1',
        submissionCount: 3,
        lastSubmittedAt: last,
        convertedCount: 1,
        awaitingCallCount: 2,
      });
      expect(result[1]).toMatchObject({
        id: 'f2',
        submissionCount: 0,
        lastSubmittedAt: null,
        convertedCount: 0,
        awaitingCallCount: 0,
      });
      expect(prisma.customFormSubmission.groupBy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { formId: { in: ['f1', 'f2'] }, AND: [stageWhere('converted')] },
        }),
      );
      expect(prisma.customFormSubmission.groupBy).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          where: { formId: { in: ['f1', 'f2'] }, AND: [stageWhere('awaiting')] },
        }),
      );
    });

    it('forma bo\'lmasa sanoq so\'rovlari yuborilmaydi', async () => {
      prisma.customForm.findMany.mockResolvedValue([]);
      await expect(service.list(1, null)).resolves.toEqual([]);
      expect(prisma.customFormSubmission.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('javoblarni endi qaytarmaydi — ular alohida endpoint\'da', async () => {
      prisma.customForm.findFirst.mockResolvedValue({ id: 'f1' });
      await service.findOne('f1', 1, null);
      const select = prisma.customForm.findFirst.mock.calls[0][0].select;
      expect(select.submissions).toBeUndefined();
    });
  });
```

Faylning tepasiga import qo'shing:

```ts
import { stageWhere } from './submission-stage';
```

- [ ] **Step 2: Test yiqilishini ko'rish**

Run: `cd server && npx jest src/custom-forms/custom-forms.service.spec.ts`
Expected: FAIL — `lastSubmittedAt` yo'q; `select.submissions` aniqlangan

- [ ] **Step 3: Implementatsiya**

`custom-forms.service.ts` — importlarga qo'shing:

```ts
import { stageWhere } from './submission-stage';
```

Faylning tepasida (`type FormFieldValue` dan keyin) qo'shing:

```ts
interface FormSubmissionStats {
  lastSubmittedAt: Date | null;
  convertedCount: number;
  awaitingCallCount: number;
}
```

`list()` ning `return forms.map(...)` qismini almashtiring:

```ts
    const stats = await this.submissionStatsFor(forms.map((f) => f.id));
    return forms.map(({ _count, ...rest }) => ({
      ...rest,
      submissionCount: _count.submissions,
      ...(stats.get(rest.id) ?? EMPTY_STATS),
    }));
  }

  /**
   * Ro'yxatdagi har bir forma uchun uchta son: oxirgi javob, o'quvchi
   * bo'lganlar, qo'ng'iroq kutayotganlar. Formalar soniga qaramay uchta so'rov.
   */
  private async submissionStatsFor(
    formIds: string[],
  ): Promise<Map<string, FormSubmissionStats>> {
    const stats = new Map<string, FormSubmissionStats>();
    if (!formIds.length) return stats;

    const [latest, converted, awaiting] = await Promise.all([
      this.prisma.customFormSubmission.groupBy({
        by: ['formId'],
        where: { formId: { in: formIds } },
        _max: { submittedAt: true },
      }),
      this.prisma.customFormSubmission.groupBy({
        by: ['formId'],
        where: { formId: { in: formIds }, AND: [stageWhere('converted')] },
        _count: { _all: true },
      }),
      this.prisma.customFormSubmission.groupBy({
        by: ['formId'],
        where: { formId: { in: formIds }, AND: [stageWhere('awaiting')] },
        _count: { _all: true },
      }),
    ]);

    for (const id of formIds) stats.set(id, { ...EMPTY_STATS });
    for (const row of latest) {
      const s = stats.get(row.formId);
      if (s) s.lastSubmittedAt = row._max.submittedAt;
    }
    for (const row of converted) {
      const s = stats.get(row.formId);
      if (s) s.convertedCount = row._count._all;
    }
    for (const row of awaiting) {
      const s = stats.get(row.formId);
      if (s) s.awaitingCallCount = row._count._all;
    }
    return stats;
  }
```

`FormSubmissionStats` interfeysidan keyin qo'shing:

```ts
const EMPTY_STATS: FormSubmissionStats = {
  lastSubmittedAt: null,
  convertedCount: 0,
  awaitingCallCount: 0,
};
```

`findOne()` dagi `select` ichidan butun `submissions: { ... }` blokini (hozirgi 120–129 qatorlar) o'chiring.

- [ ] **Step 4: Test o'tishini ko'rish**

Run: `cd server && npx jest src/custom-forms`
Expected: PASS (barcha custom-forms testlari)

- [ ] **Step 5: Prettier + lint + typecheck**

Run: `cd server && npx prettier --write src/custom-forms/custom-forms.service.ts src/custom-forms/custom-forms.service.spec.ts && npx eslint src/custom-forms/custom-forms.service.ts src/custom-forms/custom-forms.service.spec.ts && npm run typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add server/src/custom-forms/custom-forms.service.ts server/src/custom-forms/custom-forms.service.spec.ts
git commit -m "Formalar ro'yxatiga oxirgi javob va bosqich sanoqlari"
```

---

### Task 5: Client turlari va sof funksiyalar

**Files:**
- Create: `client/src/components/forms/responses/types.ts`
- Create: `client/src/components/forms/responses/submission-format.ts`
- Test: `client/src/components/forms/responses/submission-format.test.ts`
- Modify: `client/src/hooks/use-custom-forms.ts`

**Interfaces:**
- Produces (types.ts): `SubmissionStage`, `SUBMISSION_STAGES`, `STAGE_LABELS`, `STAGE_HINTS`, `NO_SOURCE_TOKEN`, `AnswerValue`, `SubmissionFieldColumn`, `SubmissionCaller`, `SubmissionLead`, `SubmissionRow`, `SubmissionSourceCount`, `SubmissionCounts`, `SubmissionsResponse`, `SubmissionsExport`
- Produces (submission-format.ts): `formatSubmittedAt(iso, now?)`, `telHref(phone)`, `displayName(row)`, `displayPhone(row)`, `answerText(column, value)`, `withCalled(response, rowId, calledAt, calledBy)`, `csvCell(value)`, `buildSubmissionsCsv(exp)`, `submissionsCsvFileName(title, now)`
- Produces (use-custom-forms.ts): `CustomFormSummary` ga `lastSubmittedAt: string | null`, `convertedCount: number`, `awaitingCallCount: number`; `CustomFormDetail` dan `submissions` olib tashlanadi

- [ ] **Step 1: Turlar**

`client/src/components/forms/responses/types.ts`:

```ts
import type { LeadStatus } from "@/hooks/use-leads-board";

/** Server `submission-stage.ts` bilan bir xil. Bosqichni client hisoblamaydi. */
export type SubmissionStage = "awaiting" | "contacted" | "converted" | "lost";

export const SUBMISSION_STAGES: readonly SubmissionStage[] = [
  "awaiting",
  "contacted",
  "converted",
  "lost",
];

export const STAGE_LABELS: Record<SubmissionStage, string> = {
  awaiting: "Qo'ng'iroq kutmoqda",
  contacted: "Aloqada",
  converted: "O'quvchi bo'ldi",
  lost: "Yo'qotildi",
};

export const STAGE_HINTS: Record<SubmissionStage, string> = {
  awaiting: "Hali hech kim qo'ng'iroq qilmagan yangi lidlar",
  contacted: "Qo'ng'iroq qilingan yoki sinov darsidagi lidlar",
  converted: "O'quvchiga aylangan lidlar",
  lost: "Yo'qotilgan yoki arxivlangan lidlar",
};

/** `?source=` da manbasi yo'q javoblar (server `NO_SOURCE_TOKEN`). */
export const NO_SOURCE_TOKEN = "none";

export type AnswerValue = string | number | boolean;

export interface SubmissionFieldColumn {
  id: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
}

export interface SubmissionCaller {
  id: number;
  firstName: string;
  lastName: string;
}

export interface SubmissionLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  statusEnum: LeadStatus;
  archived: boolean;
  calledAt: string | null;
  calledBy: SubmissionCaller | null;
  convertedStudentId: number | null;
  lostReason: string | null;
  source: { id: string; name: string } | null;
}

export interface SubmissionRow {
  id: string;
  submittedAt: string;
  data: Record<string, AnswerValue>;
  stage: SubmissionStage;
  isRepeat: boolean;
  submitted: { firstName: string; lastName: string; phone: string };
  lead: SubmissionLead | null;
}

export interface SubmissionSourceCount {
  id: string | null;
  name: string | null;
  count: number;
}

export interface SubmissionCounts {
  stages: Record<SubmissionStage, number>;
  sources: SubmissionSourceCount[];
}

export interface SubmissionsResponse {
  data: SubmissionRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: SubmissionCounts;
  fields: SubmissionFieldColumn[];
  legacyFields: SubmissionFieldColumn[];
}

export type SubmissionsExport = Pick<
  SubmissionsResponse,
  "data" | "fields" | "legacyFields"
>;
```

- [ ] **Step 2: Failing test yozish**

`client/src/components/forms/responses/submission-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  answerText,
  buildSubmissionsCsv,
  csvCell,
  displayName,
  formatSubmittedAt,
  submissionsCsvFileName,
  telHref,
  withCalled,
} from "./submission-format";
import type { SubmissionLead, SubmissionRow, SubmissionsResponse } from "./types";

function row(over: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id: "s1",
    submittedAt: new Date(2026, 8, 10, 14, 5).toISOString(),
    data: {},
    stage: "awaiting",
    isRepeat: false,
    submitted: { firstName: "Ali", lastName: "Valiyev", phone: "901234567" },
    lead: {
      id: "l1",
      firstName: "Ali",
      lastName: "Valiyev",
      phone: "901234567",
      statusEnum: "NEW",
      archived: false,
      calledAt: null,
      calledBy: null,
      convertedStudentId: null,
      lostReason: null,
      source: { id: "ig", name: "Instagram" },
    },
    ...over,
  };
}

const baseLead = row().lead as SubmissionLead;

function response(rows: SubmissionRow[]): SubmissionsResponse {
  return {
    data: rows,
    total: rows.length,
    page: 1,
    pageSize: 10,
    counts: {
      stages: { awaiting: 1, contacted: 0, converted: 0, lost: 0 },
      sources: [],
    },
    fields: [],
    legacyFields: [],
  };
}

describe("formatSubmittedAt", () => {
  const now = new Date(2026, 8, 11, 18, 0);
  it("bugun", () => {
    expect(formatSubmittedAt(new Date(2026, 8, 11, 14, 5).toISOString(), now)).toBe("Bugun, 14:05");
  });
  it("kecha", () => {
    expect(formatSubmittedAt(new Date(2026, 8, 10, 9, 30).toISOString(), now)).toBe("Kecha, 09:30");
  });
  it("undan oldin", () => {
    expect(formatSubmittedAt(new Date(2026, 8, 1, 8, 0).toISOString(), now)).toBe("01.09.2026, 08:00");
  });
});

describe("telHref", () => {
  it("9 raqamga +998 qo'shadi", () => {
    expect(telHref("901234567")).toBe("tel:+998901234567");
  });
  it("chet el raqamini o'zgartirmaydi", () => {
    expect(telHref("79161234567")).toBe("tel:+79161234567");
  });
});

describe("displayName", () => {
  it("lid bo'lsa lid ismi", () => {
    expect(displayName(row({ lead: { ...baseLead, firstName: "Olim" } }))).toBe("Olim Valiyev");
  });
  it("lid o'chirilgan bo'lsa formadagi ism", () => {
    expect(displayName(row({ lead: null }))).toBe("Ali Valiyev");
  });
});

describe("answerText", () => {
  const select = { id: "lvl", label: "Daraja", options: [{ value: "a1", label: "A1" }] };
  it("variant label'i", () => {
    expect(answerText(select, "a1")).toBe("A1");
  });
  it("checkbox", () => {
    expect(answerText({ id: "c", label: "C" }, true)).toBe("Ha");
    expect(answerText({ id: "c", label: "C" }, false)).toBe("Yo'q");
  });
  it("bo'sh qiymat", () => {
    expect(answerText(select, undefined)).toBe("");
  });
});

describe("withCalled", () => {
  const caller = { id: 10001, firstName: "Aziza", lastName: "K" };
  it("kutmoqda → aloqada, sanoq ko'chadi", () => {
    const next = withCalled(response([row()]), "s1", "2026-09-11T10:00:00Z", caller);
    expect(next.data[0].stage).toBe("contacted");
    expect(next.data[0].lead?.calledBy).toEqual(caller);
    expect(next.counts.stages).toEqual({ awaiting: 0, contacted: 1, converted: 0, lost: 0 });
  });
  it("belgini olib tashlash NEW lidni kutmoqdaga qaytaradi", () => {
    const called = withCalled(response([row()]), "s1", "2026-09-11T10:00:00Z", caller);
    const back = withCalled(called, "s1", null, null);
    expect(back.data[0].stage).toBe("awaiting");
    expect(back.counts.stages.awaiting).toBe(1);
  });
  it("sinovdagi lid belgisiz ham aloqada qoladi", () => {
    const trial = row({ stage: "contacted", lead: { ...baseLead, statusEnum: "TRIAL", calledAt: "2026-09-11T10:00:00Z" } });
    const res = response([trial]);
    res.counts.stages = { awaiting: 0, contacted: 1, converted: 0, lost: 0 };
    const next = withCalled(res, "s1", null, null);
    expect(next.data[0].stage).toBe("contacted");
    expect(next.counts.stages.contacted).toBe(1);
  });
});

describe("csvCell", () => {
  it("vergul va qo'shtirnoqni qochiradi", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
  it("formula bilan boshlangan matnni zararsizlaydi", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
  it("telefon raqamiga tegmaydi", () => {
    expect(csvCell("+998 90 123 45 67")).toBe("+998 90 123 45 67");
  });
});

describe("buildSubmissionsCsv", () => {
  it("BOM, sarlavha, qo'shimcha maydon javobi", () => {
    const csv = buildSubmissionsCsv({
      data: [row({ data: { lvl: "a1" } })],
      fields: [{ id: "lvl", label: "Daraja", options: [{ value: "a1", label: "A1" }] }],
      legacyFields: [],
    });
    const [header, first] = csv.replace("\uFEFF", "").split("\r\n");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(header).toBe("Ism,Familiya,Telefon,Manba,Yuborildi,Bosqich,Qo'ng'iroq qilingan,Daraja");
    expect(first).toBe("Ali,Valiyev,+998 90 123 45 67,Instagram,10.09.2026 14:05,Qo'ng'iroq kutmoqda,,A1");
  });
});

describe("submissionsCsvFileName", () => {
  it("nomdan slug yasaydi", () => {
    expect(submissionsCsvFileName("Ro'yxatdan o'tish!", new Date(2026, 8, 11))).toBe(
      "ro-yxatdan-o-tish-javoblar-2026-09-11.csv",
    );
  });
});
```

- [ ] **Step 3: Test yiqilishini ko'rish**

Run: `cd client && npx vitest run src/components/forms/responses/submission-format.test.ts`
Expected: FAIL — `Failed to resolve import "./submission-format"`

- [ ] **Step 4: Implementatsiya**

`client/src/components/forms/responses/submission-format.ts`:

```ts
import { format, isSameDay, subDays } from "date-fns";
import { formatPhone } from "@/lib/format-utils";
import {
  STAGE_LABELS,
  type AnswerValue,
  type SubmissionCaller,
  type SubmissionFieldColumn,
  type SubmissionRow,
  type SubmissionsExport,
  type SubmissionsResponse,
} from "./types";

/** «Bugun, 14:05» — admin «bu bugungi story'danmi?» degan savolga tez javob oladi. */
export function formatSubmittedAt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = format(date, "HH:mm");
  if (isSameDay(date, now)) return `Bugun, ${time}`;
  if (isSameDay(date, subDays(now, 1))) return `Kecha, ${time}`;
  return format(date, "dd.MM.yyyy, HH:mm");
}

export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 9 ? `tel:+998${digits}` : `tel:+${digits}`;
}

/** Lid bo'lsa uning joriy ismi, lid butunlay o'chirilgan bo'lsa formaga yozilgani. */
export function displayName(row: SubmissionRow): string {
  const source = row.lead ?? row.submitted;
  return `${source.firstName} ${source.lastName}`.trim() || "—";
}

export function displayPhone(row: SubmissionRow): string {
  return row.lead?.phone ?? row.submitted.phone;
}

export function answerText(
  column: SubmissionFieldColumn,
  value: AnswerValue | undefined,
): string {
  if (value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Ha" : "Yo'q";
  const option = column.options?.find((o) => o.value === value);
  return option ? option.label : String(value);
}

/**
 * Qo'ng'iroq belgisini bitta qatorga qo'llaydi va bosqich sanoqlarini
 * moslaydi. Server qayta so'ralmaydi, shuning uchun «Qo'ng'iroq kutmoqda»
 * filtrida belgilangan qator ro'yxatdan sakrab ketmaydi.
 */
export function withCalled(
  response: SubmissionsResponse,
  rowId: string,
  calledAt: string | null,
  calledBy: SubmissionCaller | null,
): SubmissionsResponse {
  const target = response.data.find((r) => r.id === rowId);
  if (!target?.lead) return response;
  const nextStage = stageAfterCall(target, calledAt);
  const stages = { ...response.counts.stages };
  if (nextStage !== target.stage) {
    stages[target.stage] -= 1;
    stages[nextStage] += 1;
  }
  return {
    ...response,
    counts: { ...response.counts, stages },
    data: response.data.map((r) =>
      r.id === rowId && r.lead
        ? { ...r, stage: nextStage, lead: { ...r.lead, calledAt, calledBy } }
        : r,
    ),
  };
}

// Faqat «kutmoqda» ↔ «aloqada» o'tadi. O'quvchi bo'lgan, yo'qotilgan yoki
// sinovdagi lidning bosqichini qo'ng'iroq belgisi o'zgartirmaydi.
function stageAfterCall(
  row: SubmissionRow,
  calledAt: string | null,
): SubmissionRow["stage"] {
  if (row.stage === "awaiting" && calledAt) return "contacted";
  if (row.stage === "contacted" && !calledAt && row.lead?.statusEnum === "NEW") {
    return "awaiting";
  }
  return row.stage;
}

const CSV_HEADERS = [
  "Ism",
  "Familiya",
  "Telefon",
  "Manba",
  "Yuborildi",
  "Bosqich",
  "Qo'ng'iroq qilingan",
];

const PHONE_LIKE = /^\+?\d[\d ]*$/;

/**
 * Excel `=`, `+`, `-`, `@` bilan boshlangan katakni formula deb o'qiydi.
 * Javoblar ommaviy formadan keladi, shuning uchun bunday matn oldiga `'`
 * qo'yiladi. Telefon raqami bundan mustasno.
 */
export function csvCell(value: string): string {
  const guarded =
    /^[=+\-@\t\r]/.test(value) && !PHONE_LIKE.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function buildSubmissionsCsv(exp: SubmissionsExport): string {
  const extra = [...exp.fields, ...exp.legacyFields];
  const header = [...CSV_HEADERS, ...extra.map((f) => f.label)];
  const lines = exp.data.map((row) => {
    const person = row.lead ?? row.submitted;
    const phone = displayPhone(row);
    return [
      person.firstName,
      person.lastName,
      phone ? formatPhone(phone) : "",
      row.lead?.source?.name ?? "",
      format(new Date(row.submittedAt), "dd.MM.yyyy HH:mm"),
      STAGE_LABELS[row.stage],
      row.lead?.calledAt ? format(new Date(row.lead.calledAt), "dd.MM.yyyy HH:mm") : "",
      ...extra.map((f) => answerText(f, row.data[f.id])),
    ];
  });
  return (
    "\uFEFF" +
    [header, ...lines].map((cells) => cells.map(csvCell).join(",")).join("\r\n")
  );
}

export function submissionsCsvFileName(title: string, now: Date): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "forma"}-javoblar-${format(now, "yyyy-MM-dd")}.csv`;
}
```

- [ ] **Step 5: Test o'tishini ko'rish**

Run: `cd client && npx vitest run src/components/forms/responses/submission-format.test.ts`
Expected: PASS

- [ ] **Step 6: `use-custom-forms.ts` turlari**

`client/src/hooks/use-custom-forms.ts` — `CustomFormSummary` ga `submissionCount: number;` dan keyin qo'shing:

```ts
  lastSubmittedAt: string | null;
  convertedCount: number;
  awaitingCallCount: number;
```

`CustomFormDetail` dan `submissions: Array<{ ... }>;` blokini o'chiring (endi javoblar alohida endpoint'da).

- [ ] **Step 7: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/forms/responses src/hooks/use-custom-forms.ts`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add client/src/components/forms/responses/types.ts client/src/components/forms/responses/submission-format.ts client/src/components/forms/responses/submission-format.test.ts client/src/hooks/use-custom-forms.ts
git commit -m "Forma javoblari: client turlari va sof funksiyalar"
```

---

### Task 6: Tiklash dialogini ajratish

**Files:**
- Create: `client/src/components/leads/restore-lead-dialog.tsx`
- Modify: `client/src/components/leads/leads-archive.tsx`

**Interfaces:**
- Produces: `RestoreLeadDialog({ target: RestoreLeadTarget | null; columns: RestoreColumn[]; onClose: () => void; onRestored: () => void })`, `interface RestoreLeadTarget { id: string; firstName: string; lastName: string }`, `interface RestoreColumn { id: string; name: string; sections: { id: string; name: string }[] }`

- [ ] **Step 1: Yangi fayl**

`client/src/components/leads/restore-lead-dialog.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface RestoreLeadTarget {
  id: string;
  firstName: string;
  lastName: string;
}

export interface RestoreColumn {
  id: string;
  name: string;
  sections: { id: string; name: string }[];
}

/**
 * Arxivdagi lidni tanlangan ustun va bo'limga qaytaradi. Lidlar arxivi ham,
 * forma javoblari sahifasi ham shu dialogni ishlatadi.
 */
export function RestoreLeadDialog({
  target,
  columns,
  onClose,
  onRestored,
}: {
  target: RestoreLeadTarget | null;
  columns: RestoreColumn[];
  onClose: () => void;
  onRestored: () => void;
}) {
  const [columnId, setColumnId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!target;

  useEffect(() => {
    if (open) {
      setColumnId("");
      setSectionId("");
      setSubmitting(false);
    }
  }, [open]);

  const sections = useMemo(
    () => columns.find((c) => c.id === columnId)?.sections ?? [],
    [columns, columnId],
  );

  async function handleConfirm() {
    if (!target) return;
    if (!columnId || !sectionId) {
      toast.error("Ustun va bo'limni tanlang");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/leads/${target.id}/restore`, { columnId, sectionId });
      toast.success("Lid tiklandi");
      onRestored();
    } catch (error) {
      toast.error(getErrorMessage(error, "Tiklashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lidni tiklash</DialogTitle>
          <DialogDescription>
            &laquo;{target?.firstName} {target?.lastName}&raquo; lidi
            qaytariladigan ustun va bo&apos;limni tanlang
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ustun</Label>
            <Select
              value={columnId}
              onValueChange={(v) => {
                setColumnId(v);
                setSectionId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ustunni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Bo&apos;lim</Label>
            <Select
              value={sectionId}
              onValueChange={setSectionId}
              disabled={!columnId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    columnId
                      ? sections.length
                        ? "Bo'limni tanlang"
                        : "Bu ustunda bo'lim yo'q"
                      : "Avval ustunni tanlang"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sections.map((sec) => (
                  <SelectItem key={sec.id} value={sec.id}>
                    {sec.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Tiklash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `leads-archive.tsx` dan eski nusxani olib tashlash**

`client/src/components/leads/leads-archive.tsx` da:
1. `// Restore a lead — pick column + section` izoh blokini (uchta qator) va undan keyingi
   butun `function RestoreLeadDialog(...) { ... }` funksiyasini (`// Restore a section` izoh
   blokidan oldingi yopuvchi `}` gacha) o'chiring.
2. Importlar oxiriga qo'shing: `import { RestoreLeadDialog } from "./restore-lead-dialog";`
3. Birinchi qatordagi `react` importidan `useMemo` ni olib tashlang (u faqat o'chirilgan
   dialogda ishlatilgan edi): `import { useCallback, useEffect, useState } from "react";`

`<RestoreLeadDialog target={restoreLeadTarget} columns={columns} ... />` chaqiruvi o'zgarishsiz
qoladi — `ArchivedLead` va `BoardColumn` yangi turlarga tuzilish jihatdan mos.

- [ ] **Step 3: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/leads/leads-archive.tsx src/components/leads/restore-lead-dialog.tsx`
Expected: 0 errors, 0 «unused» ogohlantirishi

- [ ] **Step 4: Commit**

```bash
git add client/src/components/leads/restore-lead-dialog.tsx client/src/components/leads/leads-archive.tsx
git commit -m "Lidni tiklash dialogi alohida faylga ajratildi"
```

---

### Task 7: Javoblar hook'i va umumiy sahifalash

**Files:**
- Create: `client/src/components/forms/responses/use-form-submissions.ts`
- Create: `client/src/components/forms/table-pagination.tsx`

**Interfaces:**
- Consumes: `SubmissionsResponse`, `SubmissionsExport` (Task 5), `withCalled`, `buildSubmissionsCsv`, `submissionsCsvFileName` (Task 5)
- Produces:
  - `SUBMISSION_FILTER_SCHEMA` (`stage`, `source`, `search`, `startDate`, `endDate`, `page`, `pageSize`)
  - `useFormSubmissions(formId: string)` → `{ filters, setFilters, resetFilters, result: SubmissionsResponse | null, loading: boolean, refetch: () => Promise<void>, toggleCalled: (rowId: string, called: boolean) => Promise<boolean>, exporting: boolean, exportCsv: (title: string) => Promise<void> }`
  - `type FormSubmissionsState = ReturnType<typeof useFormSubmissions>`
  - `TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange })`, `PAGE_SIZE_OPTIONS`

- [ ] **Step 1: Sahifalash komponenti**

`client/src/components/forms/table-pagination.tsx`:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Sahifada:</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger className="h-8 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">Jami: {total} ta</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" />
          <span className="sr-only">Oldingi sahifa</span>
        </Button>
        <span className="text-sm tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-4" />
          <span className="sr-only">Keyingi sahifa</span>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Hook**

`client/src/components/forms/responses/use-form-submissions.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { listParam, useUrlFilters } from "@/hooks/use-url-filters";
import {
  buildSubmissionsCsv,
  submissionsCsvFileName,
  withCalled,
} from "./submission-format";
import type { SubmissionsExport, SubmissionsResponse } from "./types";

export const SUBMISSION_FILTER_SCHEMA = {
  stage: { type: "string" as const, defaultValue: "" },
  source: { type: "array" as const, defaultValue: [] as string[] },
  search: { type: "string" as const, defaultValue: "" },
  startDate: { type: "string" as const, defaultValue: "" },
  endDate: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

export function useFormSubmissions(formId: string) {
  const { filters, setFilters, resetFilters } = useUrlFilters(
    SUBMISSION_FILTER_SCHEMA,
  );
  const user = useAuth((s) => s.user);
  const [result, setResult] = useState<SubmissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // «Bekor qilish» toast'i qator o'zgarganidan keyin chaqiriladi — eng oxirgi
  // holatni o'qish uchun.
  const latest = useRef<SubmissionsResponse | null>(null);
  useEffect(() => {
    latest.current = result;
  }, [result]);

  const queryParams = useMemo(
    () => ({
      stage: filters.stage || undefined,
      source: listParam(filters.source),
      search: filters.search.trim() || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    }),
    [filters.stage, filters.source, filters.search, filters.startDate, filters.endDate],
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<SubmissionsResponse>(
        `/custom-forms/${formId}/submissions`,
        {
          params: {
            ...queryParams,
            page: filters.page,
            pageSize: filters.pageSize,
          },
        },
      );
      setResult(data);
    } catch (error) {
      toast.error(getErrorMessage(error, "Javoblarni yuklashda xatolik"));
    } finally {
      setLoading(false);
    }
  }, [formId, queryParams, filters.page, filters.pageSize]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const toggleCalled = useCallback(
    async (rowId: string, called: boolean): Promise<boolean> => {
      const row = latest.current?.data.find((r) => r.id === rowId);
      if (!row?.lead) return false;
      const previous = { calledAt: row.lead.calledAt, calledBy: row.lead.calledBy };
      const caller = user
        ? { id: user.id, firstName: user.firstName, lastName: user.lastName }
        : null;

      setResult((cur) =>
        cur &&
        withCalled(
          cur,
          rowId,
          called ? new Date().toISOString() : null,
          called ? caller : null,
        ),
      );
      try {
        await api.patch(`/leads/${row.lead.id}/called`, { called });
        return true;
      } catch (error) {
        setResult((cur) =>
          cur && withCalled(cur, rowId, previous.calledAt, previous.calledBy),
        );
        toast.error(
          getErrorMessage(error, "Qo'ng'iroq belgisini saqlashda xatolik"),
        );
        return false;
      }
    },
    [user],
  );

  const exportCsv = useCallback(
    async (title: string) => {
      setExporting(true);
      try {
        const { data } = await api.get<SubmissionsExport>(
          `/custom-forms/${formId}/submissions/export`,
          { params: queryParams },
        );
        downloadCsv(
          buildSubmissionsCsv(data),
          submissionsCsvFileName(title, new Date()),
        );
        toast.success(`${data.data.length} ta javob yuklab olindi`);
      } catch (error) {
        toast.error(getErrorMessage(error, "CSV tayyorlashda xatolik"));
      } finally {
        setExporting(false);
      }
    },
    [formId, queryParams],
  );

  return {
    filters,
    setFilters,
    resetFilters,
    result,
    loading,
    refetch,
    toggleCalled,
    exporting,
    exportCsv,
  };
}

export type FormSubmissionsState = ReturnType<typeof useFormSubmissions>;

function downloadCsv(content: string, fileName: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/forms/responses/use-form-submissions.ts src/components/forms/table-pagination.tsx`
Expected: 0 errors. Agar `react-hooks/set-state-in-effect` `useEffect(() => { void refetch(); })` ga
xato bersa: `leads-list.tsx` dagi xuddi shu naqsh (`useEffect(() => { fetchLeads(); }, ...)`)
qanday o'tayotganini ko'ring va bir xil yozing.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/forms/responses/use-form-submissions.ts client/src/components/forms/table-pagination.tsx
git commit -m "Forma javoblari hook'i va umumiy sahifalash"
```

---

### Task 8: Javoblar jadvali va filtrlari

**Files:**
- Create: `client/src/components/forms/responses/stage-chips.tsx`
- Create: `client/src/components/forms/responses/source-breakdown.tsx`
- Create: `client/src/components/forms/responses/responses-toolbar.tsx`
- Create: `client/src/components/forms/responses/submission-cells.tsx`
- Create: `client/src/components/forms/responses/call-cell.tsx`
- Create: `client/src/components/forms/responses/responses-table.tsx`

**Interfaces:**
- Consumes: Task 5 turlari va funksiyalari
- Produces:
  - `StageChips({ counts: Record<SubmissionStage, number>; value: SubmissionStage | ""; onChange: (stage: SubmissionStage | "") => void })`
  - `SourceBreakdown({ sources: SubmissionSourceCount[]; value: string[]; onChange: (next: string[]) => void })`
  - `interface ToolbarFilters { stage: string; source: string[]; search: string; startDate: string; endDate: string }`
  - `ResponsesToolbar({ counts: SubmissionCounts; filters: ToolbarFilters; onChange: (updates: Partial<ToolbarFilters>) => void })`
  - `CallCell({ row: SubmissionRow; onToggle: (rowId: string, called: boolean) => Promise<boolean> })`
  - `ResponsesTable({ rows; columns: SubmissionFieldColumn[]; loading; offset; onToggleCalled; onOpenLead: (leadId: string) => void; onRestore: (row: SubmissionRow) => void })`

- [ ] **Step 1: Bosqich chiplari**

`client/src/components/forms/responses/stage-chips.tsx`:

```tsx
"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  STAGE_HINTS,
  STAGE_LABELS,
  SUBMISSION_STAGES,
  type SubmissionStage,
} from "./types";

interface Props {
  counts: Record<SubmissionStage, number>;
  value: SubmissionStage | "";
  onChange: (stage: SubmissionStage | "") => void;
}

/**
 * Yagona holat filtri. Bosqichlar bir-birini qoplamaydi va yig'indisi jami
 * javobga teng, shuning uchun bittasi tanlanadi; qayta bosilsa — hammasi.
 */
export function StageChips({ counts, value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Bosqich"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {SUBMISSION_STAGES.map((stage) => {
        const active = value === stage;
        const count = counts[stage];
        return (
          <Tooltip key={stage}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? "" : stage)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                  !active && count === 0 && "text-muted-foreground",
                )}
              >
                {STAGE_LABELS[stage]}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    !active &&
                      stage === "awaiting" &&
                      count > 0 &&
                      "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {count}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{STAGE_HINTS[stage]}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Manba taqsimoti**

`client/src/components/forms/responses/source-breakdown.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { NO_SOURCE_TOKEN, type SubmissionSourceCount } from "./types";

interface Props {
  sources: SubmissionSourceCount[];
  value: string[];
  onChange: (next: string[]) => void;
}

/** «Instagram 30 · Telegram 12» — qaysi havola ishlagani, va bir vaqtda manba filtri. */
export function SourceBreakdown({ sources, value, onChange }: Props) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-1 text-muted-foreground">Manba:</span>
      {sources.map((source) => {
        const token = source.id ?? NO_SOURCE_TOKEN;
        const active = value.includes(token);
        return (
          <button
            key={token}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(active ? value.filter((v) => v !== token) : [...value, token])
            }
            className={cn(
              "rounded px-1.5 py-0.5 transition-colors",
              active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
            )}
          >
            {source.name ?? "Belgilanmagan"}{" "}
            <span className="tabular-nums text-muted-foreground">{source.count}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Toolbar**

`client/src/components/forms/responses/responses-toolbar.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SourceBreakdown } from "./source-breakdown";
import { StageChips } from "./stage-chips";
import type { SubmissionCounts, SubmissionStage } from "./types";

export interface ToolbarFilters {
  stage: string;
  source: string[];
  search: string;
  startDate: string;
  endDate: string;
}

interface Props {
  counts: SubmissionCounts;
  filters: ToolbarFilters;
  onChange: (updates: Partial<ToolbarFilters>) => void;
}

export function ResponsesToolbar({ counts, filters, onChange }: Props) {
  const setSearch = useCallback(
    (search: string) => onChange({ search }),
    [onChange],
  );
  const setSource = (source: string[]) => onChange({ source });
  const setDates = (startDate: string, endDate: string) =>
    onChange({ startDate, endDate });
  const hiddenActive =
    filters.source.length + (filters.startDate ? 1 : 0) + (filters.endDate ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden sm:block">
        <SourceBreakdown
          sources={counts.sources}
          value={filters.source}
          onChange={setSource}
        />
      </div>
      <StageChips
        counts={counts.stages}
        value={filters.stage as SubmissionStage | ""}
        onChange={(stage) => onChange({ stage })}
      />
      <div className="flex items-center gap-2">
        <SearchInput value={filters.search} onCommit={setSearch} />
        <div className="hidden items-center gap-2 sm:flex">
          <DateRange
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={setDates}
          />
        </div>
        <Popover modal>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 sm:hidden">
              <SlidersHorizontal className="size-4" />
              Filtr
              {hiddenActive > 0 && (
                <span className="tabular-nums">({hiddenActive})</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <SourceBreakdown
              sources={counts.sources}
              value={filters.source}
              onChange={setSource}
            />
            <div className="grid gap-2">
              <DateRange
                startDate={filters.startDate}
                endDate={filters.endDate}
                onChange={setDates}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/**
 * 300 ms kutib URL'ga yozadi. URL tashqaridan o'zgarsa («Filtrlarni
 * tozalash») maydon ergashadi, lekin o'zimiz yozgan qiymatning aks-sadosi
 * foydalanuvchi hozir yozayotgan matnni ezib yubormaydi.
 */
function SearchInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [sent, setSent] = useState(value);

  if (seen !== value) {
    setSeen(value);
    if (value !== sent) setDraft(value);
  }

  useEffect(() => {
    if (draft === sent) return;
    const timer = setTimeout(() => {
      setSent(draft);
      onCommit(draft);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, sent, onCommit]);

  return (
    <div className="relative flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ism yoki telefon..."
        className="pl-8"
      />
    </div>
  );
}

function DateRange({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const start = startDate ? parseISO(startDate) : undefined;
  const end = endDate ? parseISO(endDate) : undefined;
  const toStr = (d: Date | undefined) => (d ? format(d, "yyyy-MM-dd") : "");
  return (
    <>
      <DatePicker
        value={start ?? null}
        onChange={(d) => onChange(toStr(d), endDate)}
        placeholder="Boshlanish sanasi"
        maxDate={end}
        defaultMonth={end}
        className="w-full sm:w-44"
      />
      <DatePicker
        value={end ?? null}
        onChange={(d) => onChange(startDate, toStr(d))}
        placeholder="Tugash sanasi"
        minDate={start}
        defaultMonth={start}
        className="w-full sm:w-44"
      />
    </>
  );
}
```

- [ ] **Step 4: Kataklar**

`client/src/components/forms/responses/submission-cells.tsx`:

```tsx
"use client";

import type { SyntheticEvent } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Eye, GraduationCap, MoreHorizontal, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  displayName,
  displayPhone,
  formatSubmittedAt,
  telHref,
} from "./submission-format";
import type { SubmissionRow } from "./types";

/**
 * Qator bosilsa lid kartasi ochiladi. Ichidagi tugma va menyular buni
 * to'xtatadi: portal (dropdown, dialog) ichidagi bosish ham React daraxti
 * bo'ylab qatorga yetib boradi, shuning uchun o'rovchi element to'xtatadi.
 */
export function stopRowClick(event: SyntheticEvent) {
  event.stopPropagation();
}

export function SubmissionName({ row }: { row: SubmissionRow }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "truncate",
            row.stage === "awaiting" ? "font-semibold" : "font-medium",
          )}
        >
          {displayName(row)}
        </span>
        {row.isRepeat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
                Takroriy
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Bu telefon avval ham lid bo&apos;lgan</TooltipContent>
          </Tooltip>
        )}
      </div>
      <SubmissionOutcome row={row} />
    </div>
  );
}

function SubmissionOutcome({ row }: { row: SubmissionRow }) {
  const studentId = row.lead?.convertedStudentId ?? null;
  if (row.stage === "converted" && studentId !== null) {
    return (
      <Link
        href={`/students/profile/${studentId}`}
        onClick={stopRowClick}
        className="text-xs text-primary hover:underline"
      >
        O&apos;quvchi bo&apos;ldi → #{studentId}
      </Link>
    );
  }
  if (row.stage !== "lost") return null;
  const text = !row.lead
    ? "Lid o'chirilgan"
    : row.lead.lostReason
      ? `Yo'qotildi: «${row.lead.lostReason}»`
      : "Yo'qotildi";
  return <p className="truncate text-xs text-muted-foreground">{text}</p>;
}

export function SubmissionPhone({ row }: { row: SubmissionRow }) {
  const phone = displayPhone(row);
  if (!phone) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={telHref(phone)}
      onClick={stopRowClick}
      className="whitespace-nowrap tabular-nums hover:underline"
    >
      {formatPhone(phone)}
    </a>
  );
}

export function SubmittedAt({ iso }: { iso: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="whitespace-nowrap tabular-nums">
          {formatSubmittedAt(iso)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{format(new Date(iso), "dd.MM.yyyy, HH:mm:ss")}</TooltipContent>
    </Tooltip>
  );
}

export function SubmissionActions({
  row,
  onOpenLead,
  onRestore,
}: {
  row: SubmissionRow;
  onOpenLead: (leadId: string) => void;
  onRestore: (row: SubmissionRow) => void;
}) {
  const lead = row.lead;
  if (!lead) return null;
  const canOpen = !lead.archived;
  const canRestore = lead.archived && row.stage === "lost";
  const studentId = lead.convertedStudentId;
  if (!canOpen && !canRestore && studentId === null) return null;

  return (
    <div onClick={stopRowClick}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Amallar</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canOpen && (
            <DropdownMenuItem onClick={() => onOpenLead(lead.id)}>
              <Eye className="mr-2 size-4" />
              Lidni ochish
            </DropdownMenuItem>
          )}
          {canRestore && (
            <DropdownMenuItem onClick={() => onRestore(row)}>
              <RotateCcw className="mr-2 size-4" />
              Tiklash
            </DropdownMenuItem>
          )}
          {studentId !== null && (
            <DropdownMenuItem asChild>
              <Link href={`/students/profile/${studentId}`}>
                <GraduationCap className="mr-2 size-4" />
                O&apos;quvchi profili
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 5: Qo'ng'iroq katagi**

`client/src/components/forms/responses/call-cell.tsx`:

```tsx
"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Check, Loader2, Phone, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SubmissionRow } from "./types";

interface Props {
  row: SubmissionRow;
  onToggle: (rowId: string, called: boolean) => Promise<boolean>;
}

export function CallCell({ row, onToggle }: Props) {
  const [busy, setBusy] = useState(false);
  const lead = row.lead;
  // O'quvchi bo'lgan yoki arxivdagi lidga qo'ng'iroq belgisi qo'yilmaydi.
  const editable = lead !== null && !lead.archived && row.stage !== "converted";

  async function toggle(called: boolean) {
    setBusy(true);
    const ok = await onToggle(row.id, called);
    setBusy(false);
    if (!ok) return;
    if (called) {
      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Qo&apos;ng&apos;iroq belgilandi
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                toast.dismiss(t.id);
                void onToggle(row.id, false);
              }}
            >
              Bekor qilish
            </button>
          </span>
        ),
        { duration: 5000 },
      );
    } else {
      toast.success("Qo'ng'iroq belgisi olib tashlandi");
    }
  }

  if (!lead?.calledAt) {
    if (!editable) return <span className="text-muted-foreground">—</span>;
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={busy}
        onClick={() => void toggle(true)}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Phone className="size-3.5" />
        )}
        Telefon qildim
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      <span>
        {format(new Date(lead.calledAt), "dd.MM")}
        {lead.calledBy ? ` · ${lead.calledBy.firstName}` : ""}
      </span>
      {editable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              disabled={busy}
              onClick={() => void toggle(false)}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              <span className="sr-only">Belgini olib tashlash</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Qo&apos;ng&apos;iroq belgisini olib tashlash</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Jadval va mobil ro'yxat**

`client/src/components/forms/responses/responses-table.tsx`:

```tsx
"use client";

import { Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CallCell } from "./call-cell";
import { answerText } from "./submission-format";
import {
  SubmissionActions,
  SubmissionName,
  SubmissionPhone,
  SubmittedAt,
  stopRowClick,
} from "./submission-cells";
import type { SubmissionFieldColumn, SubmissionRow } from "./types";

// Kutayotgan qator fon va qalin ism bilan ajraladi — chetdagi rangli chiziq emas.
const AWAITING_ROW =
  "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30";

interface Props {
  rows: SubmissionRow[];
  columns: SubmissionFieldColumn[];
  loading: boolean;
  offset: number;
  onToggleCalled: (rowId: string, called: boolean) => Promise<boolean>;
  onOpenLead: (leadId: string) => void;
  onRestore: (row: SubmissionRow) => void;
}

export function ResponsesTable(props: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border sm:block">
        <DesktopTable {...props} />
      </div>
      <div className="sm:hidden">
        <MobileList {...props} />
      </div>
    </>
  );
}

function openableLeadId(row: SubmissionRow): string | null {
  return row.lead && !row.lead.archived ? row.lead.id : null;
}

function DesktopTable({
  rows,
  columns,
  loading,
  offset,
  onToggleCalled,
  onOpenLead,
  onRestore,
}: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>Ism familiya</TableHead>
          <TableHead>Telefon</TableHead>
          <TableHead>Manba</TableHead>
          <TableHead>Yuborildi</TableHead>
          <TableHead>Qo&apos;ng&apos;iroq</TableHead>
          {columns.map((c) => (
            <TableHead key={c.id}>{c.label}</TableHead>
          ))}
          <TableHead className="w-12 text-right">Amal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? Array.from({ length: 5 }, (_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7 + columns.length}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ))
          : rows.map((row, index) => {
              const leadId = openableLeadId(row);
              return (
                <TableRow
                  key={row.id}
                  onClick={leadId ? () => onOpenLead(leadId) : undefined}
                  className={cn(
                    leadId && "cursor-pointer",
                    row.stage === "awaiting" && AWAITING_ROW,
                  )}
                >
                  <TableCell className="border-r text-muted-foreground">
                    {offset + index + 1}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <SubmissionName row={row} />
                  </TableCell>
                  <TableCell>
                    <SubmissionPhone row={row} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.lead?.source?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <SubmittedAt iso={row.submittedAt} />
                  </TableCell>
                  <TableCell onClick={stopRowClick}>
                    <CallCell row={row} onToggle={onToggleCalled} />
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.id} className="max-w-48 truncate">
                      {answerText(c, row.data[c.id]) || "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <SubmissionActions
                      row={row}
                      onOpenLead={onOpenLead}
                      onRestore={onRestore}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
      </TableBody>
    </Table>
  );
}

function MobileList({
  rows,
  columns,
  loading,
  onToggleCalled,
  onOpenLead,
  onRestore,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((row) => {
        const leadId = openableLeadId(row);
        return (
          <li
            key={row.id}
            onClick={leadId ? () => onOpenLead(leadId) : undefined}
            className={cn("space-y-2 px-3 py-3", row.stage === "awaiting" && AWAITING_ROW)}
          >
            <div className="flex items-start justify-between gap-2">
              <SubmissionName row={row} />
              <SubmissionActions row={row} onOpenLead={onOpenLead} onRestore={onRestore} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <SubmissionPhone row={row} />
              <span>{row.lead?.source?.name ?? "Manbasiz"}</span>
              <SubmittedAt iso={row.submittedAt} />
            </div>
            {columns.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                {columns.map((c) => (
                  <Fragment key={c.id}>
                    <dt className="text-muted-foreground">{c.label}:</dt>
                    <dd>{answerText(c, row.data[c.id]) || "—"}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
            <div onClick={stopRowClick}>
              <CallCell row={row} onToggle={onToggleCalled} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 7: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/forms/responses`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add client/src/components/forms/responses/stage-chips.tsx client/src/components/forms/responses/source-breakdown.tsx client/src/components/forms/responses/responses-toolbar.tsx client/src/components/forms/responses/submission-cells.tsx client/src/components/forms/responses/call-cell.tsx client/src/components/forms/responses/responses-table.tsx
git commit -m "Forma javoblari jadvali, filtrlari va qo'ng'iroq katagi"
```

---

### Task 9: Javoblar sahifasi, builder ko'chishi, breadcrumb

**Files:**
- Create: `client/src/components/forms/responses/responses-header.tsx`
- Create: `client/src/components/forms/responses/form-responses-body.tsx`
- Create: `client/src/components/forms/responses/form-responses-client.tsx`
- Create: `client/src/app/(dashboard)/leads/forms/[id]/tahrirlash/page.tsx`
- Modify: `client/src/app/(dashboard)/leads/forms/[id]/page.tsx`
- Modify: `client/src/components/forms/form-builder-client.tsx`
- Modify: `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Consumes: Task 5–8 dagi hamma narsa; `RestoreLeadDialog`, `RestoreLeadTarget` (Task 6); `CustomFormDetail` (`use-custom-forms.ts`)
- Produces: `FormResponsesClient({ formId: string })`; `/leads/forms/[id]` = javoblar, `/leads/forms/[id]/tahrirlash` = builder

- [ ] **Step 1: Sarlavha**

`client/src/components/forms/responses/responses-header.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ArrowLeft, Download, Loader2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CustomFormDetail } from "@/hooks/use-custom-forms";
import { CopyFormLinkButton } from "../copy-form-link-dialog";

interface Props {
  form: CustomFormDetail;
  canExport: boolean;
  exporting: boolean;
  onExport: () => void;
}

export function ResponsesHeader({ form, canExport, exporting, onExport }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link href="/leads/forms">
                <ArrowLeft className="size-4" />
                <span className="sr-only">Formalarga qaytish</span>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Formalarga qaytish</TooltipContent>
        </Tooltip>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {form.title}
            </h1>
            <Badge variant={form.isActive ? "secondary" : "outline"}>
              {form.isActive ? "Faol" : "Faol emas"}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {form.section.column.name} → {form.section.name}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyFormLinkButton slug={form.slug} label="Havola" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={!canExport || exporting}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              CSV
            </Button>
          </TooltipTrigger>
          <TooltipContent>Joriy filtrdagi javoblarni Excel uchun yuklab olish</TooltipContent>
        </Tooltip>
        <Button asChild size="sm">
          <Link href={`/leads/forms/${form.id}/tahrirlash`}>
            <Pencil className="size-4" />
            Tahrirlash
          </Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Tana (toolbar + jadval + bo'sh holatlar)**

`client/src/components/forms/responses/form-responses-body.tsx`:

```tsx
"use client";

import { useCallback, type ReactNode } from "react";
import { PhoneCall, SearchX, Share2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyFormLinkButton } from "../copy-form-link-dialog";
import { TablePagination } from "../table-pagination";
import { ResponsesTable } from "./responses-table";
import { ResponsesToolbar, type ToolbarFilters } from "./responses-toolbar";
import type { SubmissionRow } from "./types";
import type { FormSubmissionsState } from "./use-form-submissions";

interface Props {
  slug: string;
  submissions: FormSubmissionsState;
  onOpenLead: (leadId: string) => void;
  onRestore: (row: SubmissionRow) => void;
}

export function FormResponsesBody({ slug, submissions, onOpenLead, onRestore }: Props) {
  const { result, loading, filters, setFilters, resetFilters, toggleCalled } =
    submissions;
  const changeFilters = useCallback(
    (updates: Partial<ToolbarFilters>) => setFilters({ ...updates, page: 1 }),
    [setFilters],
  );

  if (!result) {
    return (
      <ResponsesTable
        rows={[]}
        columns={[]}
        loading
        offset={0}
        onToggleCalled={toggleCalled}
        onOpenLead={onOpenLead}
        onRestore={onRestore}
      />
    );
  }

  const formTotal = Object.values(result.counts.stages).reduce((a, b) => a + b, 0);
  if (formTotal === 0) return <NoResponsesYet slug={slug} />;

  const otherFilters = Boolean(
    filters.source.length || filters.search || filters.startDate || filters.endDate,
  );
  const empty = !loading && result.data.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <ResponsesToolbar counts={result.counts} filters={filters} onChange={changeFilters} />
      {empty ? (
        filters.stage === "awaiting" && !otherFilters ? (
          <EmptyState
            icon={PhoneCall}
            title="Hammaga qo'ng'iroq qilindi"
            action={
              <Button variant="outline" onClick={() => changeFilters({ stage: "" })}>
                Barcha javoblar
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="Tanlangan filtrlar bo'yicha javob yo'q"
            action={
              <Button variant="outline" onClick={resetFilters}>
                Filtrlarni tozalash
              </Button>
            }
          />
        )
      ) : (
        <ResponsesTable
          rows={result.data}
          columns={[...result.fields, ...result.legacyFields]}
          loading={loading}
          offset={(filters.page - 1) * filters.pageSize}
          onToggleCalled={toggleCalled}
          onOpenLead={onOpenLead}
          onRestore={onRestore}
        />
      )}
      <TablePagination
        page={filters.page}
        pageSize={filters.pageSize}
        total={result.total}
        onPageChange={(page) => setFilters({ page })}
        onPageSizeChange={(pageSize) => setFilters({ pageSize, page: 1 })}
      />
    </div>
  );
}

function NoResponsesYet({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-16 text-center">
      <Share2 className="size-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">Hali hech kim ro&apos;yxatdan o&apos;tmadi</p>
        <p className="text-sm text-muted-foreground">
          Havolani Instagram yoki Telegram&apos;da ulashing. Javoblar shu yerda
          paydo bo&apos;ladi.
        </p>
      </div>
      <CopyFormLinkButton slug={slug} label="Havolani nusxalash" />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border px-4 py-12 text-center">
      <Icon className="size-7 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{title}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 3: Sahifa klienti**

`client/src/components/forms/responses/form-responses-client.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import type { CustomFormDetail } from "@/hooks/use-custom-forms";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { ConvertLeadDialog } from "@/components/leads/convert-lead-dialog";
import { DeleteConfirmDialog } from "@/components/leads/delete-confirm-dialog";
import { EditLeadDrawer } from "@/components/leads/edit-lead-drawer";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";
import { MoveLeadDialog } from "@/components/leads/move-lead-dialog";
import {
  RestoreLeadDialog,
  type RestoreLeadTarget,
} from "@/components/leads/restore-lead-dialog";
import { FormResponsesBody } from "./form-responses-body";
import { ResponsesHeader } from "./responses-header";
import type { SubmissionRow } from "./types";
import { useFormSubmissions } from "./use-form-submissions";

export function FormResponsesClient({ formId }: { formId: string }) {
  const router = useRouter();
  const setName = useBreadcrumbName((s) => s.setName);
  const [form, setForm] = useState<CustomFormDetail | null>(null);
  const submissions = useFormSubmissions(formId);
  const { refetch } = submissions;

  const board = useLeadsBoard((s) => s.board);
  const fetchBoard = useLeadsBoard((s) => s.fetchBoard);
  const openLeadDetail = useLeadsUi((s) => s.openLeadDetail);
  const [restoreTarget, setRestoreTarget] = useState<RestoreLeadTarget | null>(null);

  useEffect(() => {
    api
      .get<CustomFormDetail>(`/custom-forms/${formId}`)
      .then(({ data }) => {
        setForm(data);
        setName(formId, data.title);
      })
      .catch((error) => {
        toast.error(getErrorMessage(error, "Formani yuklashda xatolik"));
        router.push("/leads/forms");
      });
  }, [formId, router, setName]);

  // Lid kartasidagi «Ko'chirish», «O'quvchiga aylantirish» va tiklash dialogi
  // ustun/bo'lim ro'yxatini doska store'idan oladi.
  useEffect(() => {
    if (board.length === 0) void fetchBoard();
  }, [board.length, fetchBoard]);

  // Lid kartasi yoki u ochgan dialog yopilganda lid o'zgargan bo'lishi mumkin
  // (tahrirlash, ko'chirish, o'quvchiga aylantirish, o'chirish), shuning uchun
  // javoblar qayta so'raladi. Doska `revision`iga bog'lanmaymiz: `fetchBoard`
  // ham uni oshiradi va sahifa ochilishida ortiqcha so'rov bo'lardi.
  const leadFlowOpen = useLeadsUi((s) =>
    Boolean(s.detailLeadId || s.editLead || s.moveLead || s.convertLead || s.deleteTarget),
  );
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !leadFlowOpen) void refetch();
    wasOpen.current = leadFlowOpen;
  }, [leadFlowOpen, refetch]);

  const restoreColumns = useMemo(
    () =>
      board.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      })),
    [board],
  );

  function handleRestore(row: SubmissionRow) {
    if (!row.lead) return;
    setRestoreTarget({
      id: row.lead.id,
      firstName: row.lead.firstName,
      lastName: row.lead.lastName,
    });
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-8 w-full max-w-xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const stages = submissions.result?.counts.stages;
  const totalResponses = stages
    ? Object.values(stages).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <ResponsesHeader
        form={form}
        canExport={totalResponses > 0}
        exporting={submissions.exporting}
        onExport={() => void submissions.exportCsv(form.title)}
      />
      <FormResponsesBody
        slug={form.slug}
        submissions={submissions}
        onOpenLead={(leadId) => openLeadDetail(leadId)}
        onRestore={handleRestore}
      />

      <LeadDetailDrawer />
      <EditLeadDrawer />
      <MoveLeadDialog />
      <ConvertLeadDialog />
      <DeleteConfirmDialog />
      <RestoreLeadDialog
        target={restoreTarget}
        columns={restoreColumns}
        onClose={() => setRestoreTarget(null)}
        onRestored={() => {
          setRestoreTarget(null);
          void refetch();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Route'lar**

`client/src/app/(dashboard)/leads/forms/[id]/page.tsx` ni to'liq almashtiring:

```tsx
import { Suspense } from "react";
import { FormResponsesClient } from "@/components/forms/responses/form-responses-client";

export default async function FormResponsesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <FormResponsesClient formId={id} />
    </Suspense>
  );
}
```

`client/src/app/(dashboard)/leads/forms/[id]/tahrirlash/page.tsx`:

```tsx
import { FormBuilderClient } from "@/components/forms/form-builder-client";

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormBuilderClient formId={id} />;
}
```

`client/src/lib/breadcrumb-routes.ts` — `new: "Yangi",` qatoridan keyin qo'shing:

```ts
  tahrirlash: "Tahrirlash",
```

- [ ] **Step 5: Builder navigatsiyasi**

`client/src/components/forms/form-builder-client.tsx`:

1. Importlarga qo'shing: `import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";`
2. `FormBuilderClient` ichida, `router` e'lonidan keyin:

```ts
  const setName = useBreadcrumbName((s) => s.setName);
  // Tahrirlashda javoblar sahifasiga, yaratishda ro'yxatga qaytiladi.
  const backHref = formId ? `/leads/forms/${formId}` : "/leads/forms";
```

3. Formani yuklash effektida `setSlug(data.slug);` dan keyin `setName(formId, data.title);`
   qo'shing va effekt bog'liqliklarini `[formId, reset, router, setName]` ga o'zgartiring.
4. `onSubmit` dagi `try` blokini almashtiring:

```ts
    try {
      if (formId) {
        await api.patch<CustomFormSummary>(`/custom-forms/${formId}`, payload);
        toast.success("Forma yangilandi");
        router.push(`/leads/forms/${formId}`);
      } else {
        const { data } = await api.post<CustomFormSummary>(
          "/custom-forms",
          payload,
        );
        toast.success("Forma yaratildi");
        router.push(`/leads/forms/${data.id}`);
      }
    } catch (error) {
```

5. «Orqaga» havolasida `href="/leads/forms"` ni `href={backHref}` ga, «Bekor qilish»
   tugmasidagi `onClick={() => router.push("/leads/forms")}` ni
   `onClick={() => router.push(backHref)}` ga almashtiring. Yuklash xatosidagi
   `router.push("/leads/forms")` o'zgarmaydi.

- [ ] **Step 6: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/forms "src/app/(dashboard)/leads/forms" src/lib/breadcrumb-routes.ts`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add client/src/components/forms/responses/responses-header.tsx client/src/components/forms/responses/form-responses-body.tsx client/src/components/forms/responses/form-responses-client.tsx "client/src/app/(dashboard)/leads/forms/[id]/page.tsx" "client/src/app/(dashboard)/leads/forms/[id]/tahrirlash/page.tsx" client/src/components/forms/form-builder-client.tsx client/src/lib/breadcrumb-routes.ts
git commit -m "Forma javoblari sahifasi; builder /tahrirlash ga ko'chdi"
```

---

### Task 10: Formalar ro'yxati jadvali

**Files:**
- Modify: `client/src/components/forms/forms-list-client.tsx` (to'liq qayta yoziladi)

**Interfaces:**
- Consumes: `CustomFormSummary` yangi maydonlari (Task 5), `TablePagination` (Task 7), `CopyFormLinkButton`

- [ ] **Step 1: Faylni almashtirish**

`client/src/components/forms/forms-list-client.tsx`:

```tsx
"use client";

import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Eye,
  FileEdit,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  useCustomForms,
  type CustomFormSummary,
} from "@/hooks/use-custom-forms";
import { CopyFormLinkButton } from "./copy-form-link-dialog";
import { TablePagination } from "./table-pagination";

// Havola dialogi va menyu portal orqali chiziladi, lekin ulardagi bosish React
// daraxti bo'ylab qatorga yetib boradi — shu sabab o'rovchi katak to'xtatadi.
const stop = (event: SyntheticEvent) => event.stopPropagation();

function lastSubmitted(form: CustomFormSummary): string {
  return form.lastSubmittedAt
    ? format(new Date(form.lastSubmittedAt), "dd.MM.yyyy")
    : "Hali yo'q";
}

export function FormsListClient() {
  const router = useRouter();
  const { forms, loading, setForms } = useCustomForms(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<CustomFormSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // O'chirishdan keyin oxirgi sahifa bo'shab qolsa, mavjud oxirgisiga tushadi.
  const totalPages = Math.max(1, Math.ceil(forms.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const pageForms = forms.slice(offset, offset + pageSize);
  const open = (id: string) => router.push(`/leads/forms/${id}`);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/custom-forms/${deleteTarget.id}`);
      setForms((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      toast.success("Forma o'chirildi");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "O'chirishda xatolik"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Formani bosing: kim ro&apos;yxatdan o&apos;tgani va kimga hali
          qo&apos;ng&apos;iroq qilinmagani ko&apos;rinadi.
        </p>
        <Button asChild>
          <Link href="/leads/forms/new">
            <Plus className="size-4" />
            Yangi forma
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2 rounded-md border p-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border px-4 py-16 text-center">
          <FileEdit className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Hali forma yo&apos;q</p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/leads/forms/new">
              <Plus className="size-4" />
              Birinchi formani yaratish
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-md border sm:block">
            <FormsTable
              forms={pageForms}
              offset={offset}
              onOpen={open}
              onDelete={setDeleteTarget}
            />
          </div>
          <ul className="divide-y rounded-md border sm:hidden">
            {pageForms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                onOpen={open}
                onDelete={setDeleteTarget}
              />
            ))}
          </ul>
          <TablePagination
            page={safePage}
            pageSize={pageSize}
            total={forms.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Formani o&apos;chirish</AlertDialogTitle>
            <AlertDialogDescription>
              &laquo;{deleteTarget?.title}&raquo; formasi arxivga
              ko&apos;chiriladi. Public havola ishlamay qoladi va yangi javob
              qabul qilinmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              O&apos;chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface RowProps {
  onOpen: (id: string) => void;
  onDelete: (form: CustomFormSummary) => void;
}

function FormsTable({
  forms,
  offset,
  onOpen,
  onDelete,
}: RowProps & { forms: CustomFormSummary[]; offset: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>Forma</TableHead>
          <TableHead className="text-right">Javoblar</TableHead>
          <TableHead className="text-right">
            <span className="inline-flex items-center gap-1">
              Qo&apos;ng&apos;iroq kutmoqda
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Hali hech kim qo&apos;ng&apos;iroq qilmagan yangi lidlar soni
                </TooltipContent>
              </Tooltip>
            </span>
          </TableHead>
          <TableHead>Oxirgi javob</TableHead>
          <TableHead className="w-28">
            <span className="sr-only">Havola</span>
          </TableHead>
          <TableHead className="w-12 text-right">Amal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {forms.map((form, index) => (
          <TableRow
            key={form.id}
            className="cursor-pointer"
            onClick={() => onOpen(form.id)}
          >
            <TableCell className="border-r text-muted-foreground">
              {offset + index + 1}
            </TableCell>
            <TableCell className="max-w-80">
              <FormTitle form={form} />
            </TableCell>
            <TableCell className="text-right">
              <div className="tabular-nums">
                <div className="font-medium">{form.submissionCount}</div>
                {form.convertedCount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {form.convertedCount} tasi o&apos;quvchi bo&apos;ldi
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <AwaitingCount form={form} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {lastSubmitted(form)}
            </TableCell>
            <TableCell onClick={stop}>
              <CopyFormLinkButton slug={form.slug} label="Havola" />
            </TableCell>
            <TableCell className="text-right" onClick={stop}>
              <FormActions form={form} onOpen={onOpen} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FormCard({ form, onOpen, onDelete }: RowProps & { form: CustomFormSummary }) {
  return (
    <li className="space-y-2 px-3 py-3" onClick={() => onOpen(form.id)}>
      <div className="flex items-start justify-between gap-2">
        <FormTitle form={form} />
        <div className="flex shrink-0 items-center gap-1" onClick={stop}>
          <CopyFormLinkButton slug={form.slug} label="Havola" />
          <FormActions form={form} onOpen={onOpen} onDelete={onDelete} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">{form.submissionCount} javob</span>
        {form.awaitingCallCount > 0 && (
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            {form.awaitingCallCount} ta qo&apos;ng&apos;iroq kutmoqda
          </span>
        )}
        <span>{lastSubmitted(form)}</span>
      </div>
    </li>
  );
}

function FormTitle({ form }: { form: CustomFormSummary }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Link
          href={`/leads/forms/${form.id}`}
          onClick={stop}
          className="truncate font-medium hover:underline"
        >
          {form.title}
        </Link>
        {!form.isActive && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Faol emas
          </Badge>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {form.section.column.name} → {form.section.name}
      </p>
    </div>
  );
}

function AwaitingCount({ form }: { form: CustomFormSummary }) {
  if (form.awaitingCallCount === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Link
      href={`/leads/forms/${form.id}?stage=awaiting`}
      onClick={stop}
      className="inline-flex min-w-8 justify-center rounded-md bg-amber-100 px-2 py-0.5 text-sm font-semibold tabular-nums text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-950"
    >
      {form.awaitingCallCount}
    </Link>
  );
}

function FormActions({ form, onOpen, onDelete }: RowProps & { form: CustomFormSummary }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Amallar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onOpen(form.id)}>
          <Eye className="mr-2 size-4" />
          Javoblar
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/leads/forms/${form.id}/tahrirlash`}>
            <Pencil className="mr-2 size-4" />
            Tahrirlash
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete(form)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 size-4" />
          O&apos;chirish
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/forms/forms-list-client.tsx`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/forms/forms-list-client.tsx
git commit -m "Formalar ro'yxati jadvalga aylandi: javoblar, qo'ng'iroq kutayotganlar, oxirgi javob"
```

---

### Task 11: To'liq tekshiruv va brauzerda sinash

**Files:** o'zgarish yo'q (faqat tuzatish kerak bo'lsa)

- [ ] **Step 1: Server to'liq**

Run: `cd server && npm test && npm run typecheck && npx eslint src/custom-forms`
Expected: barcha testlar PASS, typecheck 0 xato, eslint 0 error

- [ ] **Step 2: Client to'liq**

Run: `cd client && npm test && npx eslint src && npm run build`
Expected: vitest PASS; eslint `✖ N problems (0 errors, …)`; build muvaffaqiyatli

- [ ] **Step 3: Dev serverlarni ishga tushirish**

`server/.env` dev bazaga qaraydi (prod EMAS). Worktree'dan:

Run (fon): `cd server && CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN= npm run start:dev`
Run (fon): `cd client && npm run dev`

Dev bazada forma javobi bo'lmasa, public formadan (`/f/<slug>?source=Instagram`) 3–4 ta javob
yuboring; bittasini doskadan o'chiring (yo'qotildi), bittasini «Telefon qildim» qiling.
Bo'sh natijani bo'sh natija bilan taqqoslash dalil emas — tekshiruv haqiqiy qatorlar ustida
bo'lishi kerak.

- [ ] **Step 4: Brauzer ssenariysi (1280px va 400px)**

1. `/leads/forms` — jadval: `#`, sonlar, sariq «Qo'ng'iroq kutmoqda», «Oxirgi javob».
   Havola tugmasi va ⋯ bosilganda qator ochilib ketmaydi.
2. Sariq son → `/leads/forms/<id>?stage=awaiting`, chip tanlangan.
3. Chiplar yig'indisi = jami; manba bosilsa filtrlanadi; qidiruv 300 ms dan keyin; sana oralig'i.
4. «Telefon qildim» → qator qoladi, sanoq ko'chadi, toast'da «Bekor qilish» qaytaradi.
5. Qator bosilsa lid kartasi ochiladi; yopilgach ro'yxat yangilanadi.
6. Yo'qotilgan qator ⋯ → «Tiklash» → ustun/bo'lim → qator «Qo'ng'iroq kutmoqda» ga o'tadi.
7. CSV — fayl Excel'da ochiladi, kirill/lotin buzilmaydi.
8. «Tahrirlash» → `/leads/forms/<id>/tahrirlash`, breadcrumb forma nomini ko'rsatadi,
   saqlagach javoblarga qaytadi. «Yangi forma» yaratilgach bo'sh javoblar sahifasi
   («Hali hech kim ro'yxatdan o'tmadi»).
9. 400px: ro'yxat va javoblar kartochka, «Filtr» popover, gorizontal chip'lar, sahifa
   gorizontal surilmaydi.
10. Qorong'i rejim: sariq fon va chiplar o'qiladi.

- [ ] **Step 5: Serverlarni to'xtatish va yakuniy commit (agar tuzatish bo'lgan bo'lsa)**

Tuzatilgan fayllarni aniq yo'l bilan `git add` qiling va commit qiling. So'ng
`git status --short` bo'sh ekanini tekshiring.
