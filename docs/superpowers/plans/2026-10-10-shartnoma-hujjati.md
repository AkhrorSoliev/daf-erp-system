# Shartnoma hujjati (1-bosqich) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin builds the student's education contract from the profile («Shartnomalar» tab), prints it as a PDF, marks it signed on paper and can cancel it; the branch gets city / representative fields.

**Architecture:** A new `ContractDocument` table (the old `Contract` model is read by money code and stays untouched). All values that go into the PDF are sealed into `ContractDocument.fields` (JSON) when the contract is created; the customer block and the per-course extras stay editable until it is signed. `Enrollment.contractDocumentId` links courses to a contract (one live contract per enrollment, carried over on a group transfer, cleared on cancel). The PDF is rebuilt on every request from `fields` with pdfmake, like receipts and statements. The contract text is versioned in code (`templateVersion`), version 1 = the 02.10 final text.

**Tech Stack:** NestJS 11 + Prisma 7 + PostgreSQL, pdfmake 0.2 (Inter fonts), Jest; Next.js + React Query + shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-shartnoma-hujjati-design.md` — read it once, fully, before Task 1.

## Global Constraints

- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/shartnoma-hujjati`, branch `feat/shartnoma-hujjati`. Every command runs inside it. Never `cd` into the main checkout.
- UI text is Uzbek, Latin script only, no English words on screen. Commit messages, PR text and code comments are English; ADRs and the user guide are Uzbek.
- Calendar days come from `server/src/common/date/tashkent.ts` (`tashkentDateStr`, `utcMidnightFromDateStr`, `isCalendarDateStr`). Never `getFullYear()` / `toISOString().slice()` for "today".
- Roles: every `/contract-documents` route is `@Roles('CEO', 'Branch Director', 'Administrator')`; every route checks the student's branch with `assertCallerMayTouchStudent`. Cancelling a SIGNED contract is CEO-only, the role read from the database (`whereUserMayAct`, ADR-0028).
- Only MONTHLY courses, only ACTIVE or FROZEN enrollments get a contract. LESSON_PACK is out of scope.
- `fields` are sealed at creation: branch, student and course data never change afterwards. Customer block and course extras change only while unsigned and not cancelled.
- Contract number: `DAF-YYYY-NNNNN`, year = Tashkent year of `contractDate`, sequence per company and year, `@@unique([companyId, number])`.
- Branch fields that must be filled before a contract is created: `city`, `address`, `representativeName`, `representativePosition`.
- Template v1 text = `docs/tolov-savollari/shartnoma-2026-yakuniy.txt` word for word (whitespace-normalised). Court in 9.2 is Namangan for every branch.
- The old `Contract` model, `contractId` FKs and `per-lesson-price.ts` are NOT touched.
- New files stay under 500 lines. Run `npx prettier --write` on touched SERVER files only — never on `client/`.
- Server test: `cd server && npx jest <path>`; full: `npm test`; types: `npm run typecheck`; lint: `npx eslint <files>`. Client: `cd client && npx vitest run <path>` (fallback `npx vitest --config vitest.config.ts run <path>`), `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`.
- Do not push, open a PR or deploy unless the user asks.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

Server (new): `server/src/contract-documents/`
- `contract-fields.ts` — pure: field types, branch check, minor rule, customer/course builders.
- `contract-number.ts` — pure sequence + the one DB read that finds the last number.
- `contract-view.ts` — Prisma include + mapper to the API view, prefill/list response types.
- `dto/contract-document.dto.ts` — all request DTOs.
- `contract-documents.service.ts` — list, prefill, create, update, sign, cancel, pdf.
- `contract-documents.controller.ts`, `contract-documents.module.ts`.
- `pdf/contract-template-v1.ts` — the static text of version 1.
- `pdf/contract-pdf.ts` — pdfmake document definition + render.
- specs next to each.

Server (modified): `prisma/schema.prisma` + migration, `app.module.ts`, `common/auth/branch-route-policy.ts`, `students/student-enrollment.service.ts` (+spec), `branches/dto/*.ts`, `branches/branches.service.ts`, `telegram-digest/uzbek-calendar.ts` (+spec).

Client (new): `client/src/components/students/contracts/` — `contract-types.ts`, `contract-rules.ts` (+test), `student-contracts-tab.tsx`, `contract-card.tsx`, `contract-form-dialog.tsx`, `contract-create-form.tsx`, `contract-edit-form.tsx`, `contract-courses-picker.tsx`, `contract-customer-fields.tsx`, `contract-course-extras.tsx`, `contract-cancel-dialog.tsx`.

Client (modified): `student-profile-tabs.tsx`, `lib/download-file.ts`, `lib/role-access.ts`, `lib/branch-record.ts` (+test), `hooks/use-edit-branch.ts`, `components/settings/edit-branch-form.tsx`, guide (`qollanma/kontent/oquvchilar/shartnoma.mdx`, `qollanma/sahifalar/oquvchilar.ts`, `qollanma/yangiliklar.ts`).

Docs: ADR-0075 + index, `docs/role-access.md`, `CONTEXT.md`, `server/CLAUDE.md`, `client/CLAUDE.md`.

---

### Task 0: Worktree setup

**Files:** none committed.

- [ ] **Step 1: Install dependencies and link the env file**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/shartnoma-hujjati
ln -sf /Users/a1111/Desktop/daf-erp-system/server/.env server/.env
npm --prefix server install
npm --prefix client install
```

Expected: both installs finish without errors; `server/.env` is a symlink (it is git-ignored).

- [ ] **Step 2: Generate the Prisma client and confirm a green baseline**

```bash
cd server && npx prisma generate && npx jest src/statements src/receipts && cd ..
```

Expected: `Generated Prisma Client`, all statement/receipt specs PASS.

---

### Task 1: Schema and migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20261010120000_contract_document/migration.sql`

**Interfaces:**
- Produces: Prisma model `ContractDocument` (`prisma.contractDocument`), enum `ContractSignMethod { PAPER BOT }`, `Enrollment.contractDocumentId String?` + relation `contractDocument`, `Branch.city / representativeName / representativePosition String?`.

- [ ] **Step 1: Add the enum** next to `enum ContractStatus` in `server/prisma/schema.prisma`:

```prisma
/// How a contract document was signed (ADR-0075). Stage 1 writes PAPER only;
/// BOT arrives with the Telegram «Roziman» stage.
enum ContractSignMethod {
  PAPER
  BOT
}
```

- [ ] **Step 2: Add the model** directly after `model Contract { ... }`:

```prisma
/// Ta'lim xizmati shartnomasining hujjati (ADR-0075). Eski `Contract` dan
/// alohida: uni pul kodi o'qiydi (`per-lesson-price.ts`, to'lov, qaytarish).
/// `fields` — PDF'ga tushadigan hamma qiymat, shartnoma tuzilganda muhrlanadi.
model ContractDocument {
  id              String              @id @default(uuid())
  companyId       Int
  number          String
  studentId       Int
  student         Student             @relation(fields: [studentId], references: [id])
  branchId        Int
  branch          Branch              @relation(fields: [branchId], references: [id])
  templateVersion Int
  contractDate    DateTime            @db.Date
  fields          Json
  createdById     Int?
  createdBy       User?               @relation("ContractDocumentCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  signedAt        DateTime?
  signedById      Int?
  signedBy        User?               @relation("ContractDocumentSignedBy", fields: [signedById], references: [id], onDelete: SetNull)
  signMethod      ContractSignMethod?
  cancelledAt     DateTime?
  cancelledById   Int?
  cancelledBy     User?               @relation("ContractDocumentCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)
  cancelReason    String?

  enrollments Enrollment[]

  @@unique([companyId, number])
  @@index([studentId])
  @@index([branchId])
}
```

- [ ] **Step 3: Add the back-relations and new columns**

In `model Student { ... }` add (next to `contracts Contract[]`):

```prisma
  contractDocuments ContractDocument[]
```

In `model Branch { ... }` add after `phone String?`:

```prisma
  // Shartnoma uchun (ADR-0075): sarlavhadagi shahar va Ijrochi vakili.
  city                   String?
  representativeName     String?
  representativePosition String?
```

and next to the other relation lists of `Branch`:

```prisma
  contractDocuments ContractDocument[]
```

In `model Enrollment { ... }` add after `startDate DateTime?`:

```prisma
  // The contract document this enrollment is under (ADR-0075). Carried to the
  // new enrollment on a group transfer, cleared when the contract is cancelled.
  contractDocumentId String?
  contractDocument   ContractDocument? @relation(fields: [contractDocumentId], references: [id], onDelete: SetNull)
```

and next to its other `@@index` lines:

```prisma
  @@index([contractDocumentId])
```

In `model User { ... }` add next to `deletedContracts Contract[] @relation("ContractDeletedBy")`:

```prisma
  contractDocumentsCreated   ContractDocument[] @relation("ContractDocumentCreatedBy")
  contractDocumentsSigned    ContractDocument[] @relation("ContractDocumentSignedBy")
  contractDocumentsCancelled ContractDocument[] @relation("ContractDocumentCancelledBy")
```

- [ ] **Step 4: Validate the schema**

Run: `cd server && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Write the migration by hand** — `server/prisma/migrations/20261010120000_contract_document/migration.sql`:

```sql
-- Contract documents (ADR-0075, spec 2026-10-10-shartnoma-hujjati).

-- CreateEnum
CREATE TYPE "ContractSignMethod" AS ENUM ('PAPER', 'BOT');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "city" TEXT,
ADD COLUMN     "representativeName" TEXT,
ADD COLUMN     "representativePosition" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "contractDocumentId" TEXT;

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "contractDate" DATE NOT NULL,
    "fields" JSONB NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedById" INTEGER,
    "signMethod" "ContractSignMethod",
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" INTEGER,
    "cancelReason" TEXT,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractDocument_studentId_idx" ON "ContractDocument"("studentId");

-- CreateIndex
CREATE INDEX "ContractDocument_branchId_idx" ON "ContractDocument"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_companyId_number_key" ON "ContractDocument"("companyId", "number");

-- CreateIndex
CREATE INDEX "Enrollment_contractDocumentId_idx" ON "Enrollment"("contractDocumentId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_contractDocumentId_fkey" FOREIGN KEY ("contractDocumentId") REFERENCES "ContractDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 6: Apply it to the DEV database and record it** (dev = `server/.env`, NOT production; the change is additive)

```bash
cd server
npx prisma db execute --file prisma/migrations/20261010120000_contract_document/migration.sql
npx prisma migrate resolve --applied 20261010120000_contract_document
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script | grep -n "ContractDocument\|contractDocumentId\|representative\|\"city\"" || echo "no drift for the new objects"
npx prisma generate
```

Expected: the last grep prints `no drift for the new objects` (other pre-existing dev drift may print lines that do not mention these objects — ignore them). If a line mentions a new object, the hand-written SQL differs from Prisma's: fix the SQL to match, re-run.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run build
cd ..
git add server/prisma/schema.prisma server/prisma/migrations/20261010120000_contract_document
git commit -m "feat(contract): add contract document table and branch contract fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: build passes.

---

### Task 2: Branch contract fields in the API

**Files:**
- Modify: `server/src/branches/dto/update-branch.dto.ts`, `server/src/branches/dto/create-branch.dto.ts`, `server/src/branches/branches.service.ts`
- Test: `server/src/branches/dto/update-branch.dto.spec.ts`

**Interfaces:**
- Produces: `PATCH /branches/:id` and `POST /branches` accept `city`, `representativeName`, `representativePosition`; `GET /branches` returns them.

- [ ] **Step 1: Write the failing test** — append inside `describe('UpdateBranchDto', ...)` in `update-branch.dto.spec.ts`:

```ts
  it('accepts the contract fields (ADR-0075)', async () => {
    expect(
      await rejected({
        city: 'Namangan',
        representativeName: 'Karimov Anvar',
        representativePosition: 'Direktor',
      }),
    ).toEqual([]);
  });

  it('caps the contract fields', async () => {
    expect(await rejected({ city: 'x'.repeat(101) })).toEqual(['city']);
    expect(await rejected({ representativeName: 'x'.repeat(151) })).toEqual([
      'representativeName',
    ]);
  });
```

- [ ] **Step 2: Run it** — `cd server && npx jest src/branches/dto/update-branch.dto.spec.ts` → FAIL (`city` is not whitelisted).

- [ ] **Step 3: Add the fields** — in BOTH `update-branch.dto.ts` and `create-branch.dto.ts`, add `MaxLength` to the `class-validator` import and these properties at the end of the class:

```ts
  // Printed on the student contract (ADR-0075).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  representativePosition?: string;
```

In `branches.service.ts`:
- `findAll` `select`: add `city: true, representativeName: true, representativePosition: true,` after `phone: true,`.
- `create` `tx.branch.create({ data: { ... } })`: add after `phone: dto.phone,`:

```ts
          city: dto.city,
          representativeName: dto.representativeName,
          representativePosition: dto.representativePosition,
```

(`update` passes `dto` through as `data`, so it needs no change; `findOne` returns the whole row.)

- [ ] **Step 4: Run the tests** — `npx jest src/branches` → PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/branches/dto/update-branch.dto.ts src/branches/dto/create-branch.dto.ts src/branches/branches.service.ts src/branches/dto/update-branch.dto.spec.ts
npx eslint src/branches/dto/update-branch.dto.ts src/branches/dto/create-branch.dto.ts src/branches/branches.service.ts src/branches/dto/update-branch.dto.spec.ts
cd .. && git add server/src/branches
git commit -m "feat(branches): city and representative fields for the contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Full weekday names

**Files:**
- Modify: `server/src/telegram-digest/uzbek-calendar.ts`
- Test: `server/src/telegram-digest/uzbek-calendar.spec.ts`

**Interfaces:**
- Produces: `fullWeekdaysLabel(exactDays: readonly string[]): string` → `"Dushanba, Chorshanba, Juma"`.

- [ ] **Step 1: Write the failing test** — add `fullWeekdaysLabel` to the import list of `uzbek-calendar.spec.ts` and append inside the top `describe`:

```ts
  it('writes exactDays as full day names for documents, Monday first', () => {
    expect(fullWeekdaysLabel(['friday', 'Monday', ' wednesday '])).toBe(
      'Dushanba, Chorshanba, Juma',
    );
    expect(fullWeekdaysLabel(['sunday', 'saturday'])).toBe('Shanba, Yakshanba');
    expect(fullWeekdaysLabel([])).toBe('');
    expect(fullWeekdaysLabel(['someday'])).toBe('');
  });
```

- [ ] **Step 2: Run it** — `cd server && npx jest src/telegram-digest/uzbek-calendar.spec.ts` → FAIL (`fullWeekdaysLabel` is not a function).

- [ ] **Step 3: Implement** — append to `uzbek-calendar.ts`:

```ts
const WEEK_FULL: Record<(typeof WEEK)[number][0], string> = {
  monday: 'Dushanba',
  tuesday: 'Seshanba',
  wednesday: 'Chorshanba',
  thursday: 'Payshanba',
  friday: 'Juma',
  saturday: 'Shanba',
  sunday: 'Yakshanba',
};

/**
 * `Group.exactDays` as full day names for documents (the contract's
 * «Dars jadvali»): «Dushanba, Chorshanba, Juma», Monday first. Unknown names
 * are skipped.
 */
export function fullWeekdaysLabel(exactDays: readonly string[]): string {
  const wanted = new Set(exactDays.map((d) => d.trim().toLowerCase()));
  return WEEK.filter(([day]) => wanted.has(day))
    .map(([day]) => WEEK_FULL[day])
    .join(', ');
}
```

- [ ] **Step 4: Run** — same jest command → PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/telegram-digest/uzbek-calendar.ts src/telegram-digest/uzbek-calendar.spec.ts
npx eslint src/telegram-digest/uzbek-calendar.ts src/telegram-digest/uzbek-calendar.spec.ts
cd .. && git add server/src/telegram-digest/uzbek-calendar.ts server/src/telegram-digest/uzbek-calendar.spec.ts
git commit -m "feat(calendar): full Uzbek weekday names for documents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Contract fields (pure rules)

**Files:**
- Create: `server/src/contract-documents/contract-fields.ts`
- Test: `server/src/contract-documents/contract-fields.spec.ts`

**Interfaces:**
- Consumes: `applyDiscount`, `clampDiscount` (`billing/monthly-price`), `ageOn` (`students/shared/student-onboarding`), `tashkentDateStr`.
- Produces (exact names used by later tasks):
  - `CONTRACT_TEMPLATE_VERSION = 1`, `ADULT_AGE = 18`
  - `CUSTOMER_KINDS`, `type CustomerKind = 'SELF' | 'PARENT' | 'GUARDIAN' | 'OTHER'`
  - `CONTRACT_INCLUDES`, `type ContractInclude = 'DARSLIK' | 'MATERIALLAR' | 'ICHKI_TEST' | 'SERTIFIKAT'`
  - interfaces `ContractCustomer`, `ContractCourseExtras`, `ContractCourseFields`, `ContractBranchFields`, `ContractStudentFields`, `ContractFields`, `CustomerInput`, `EnrollmentForContract`, `BranchContractRow`
  - `missingBranchFields(branch: BranchContractRow): string[]`
  - `personName(p: { firstName: string; lastName: string }): string`
  - `storedBirthDay(dob: Date): string`
  - `isMinorOn(birthDate: string, day: string): boolean`
  - `customerProblem(kind: CustomerKind, kindOther: string | undefined, isMinor: boolean): string | null`
  - `buildCustomer(input: CustomerInput, student: ContractStudentFields): ContractCustomer`
  - `withExtras(extras: Partial<ContractCourseExtras>, defaultFirstPayment: number): ContractCourseExtras`
  - `buildCourseFields(e: EnrollmentForContract, discountPercent: number, extras?: Partial<ContractCourseExtras>): ContractCourseFields`
  - `courseList(courses: Pick<ContractCourseFields, 'courseName' | 'groupName'>[]): string`

- [ ] **Step 1: Write the failing test** — `contract-fields.spec.ts`:

```ts
import {
  buildCourseFields,
  buildCustomer,
  courseList,
  customerProblem,
  isMinorOn,
  missingBranchFields,
  personName,
  storedBirthDay,
  withExtras,
  type EnrollmentForContract,
} from './contract-fields';

const enrollment = (
  over: Partial<EnrollmentForContract['group']> = {},
): EnrollmentForContract => ({
  id: 'e-1',
  startDate: null,
  createdAt: new Date('2026-09-14T05:00:00Z'),
  group: {
    name: '#032',
    level: ' A1 ',
    exactDays: ['friday', 'monday', 'wednesday'],
    lessonStartTime: '14:00',
    lessonEndTime: '15:30',
    lessonMinutes: null,
    course: { name: 'Standart', price: 450_000, lessonMinutes: 90 },
    teachers: [{ teacher: { firstName: 'Aziza', lastName: 'Karimova' } }],
    ...over,
  },
});

describe('missingBranchFields', () => {
  it('names every empty field in Uzbek', () => {
    expect(
      missingBranchFields({
        city: ' ',
        address: null,
        representativeName: 'Karimov Anvar',
        representativePosition: '',
      }),
    ).toEqual(['shahar', 'manzil', 'vakil lavozimi']);
  });

  it('is empty when all four are filled', () => {
    expect(
      missingBranchFields({
        city: 'Namangan',
        address: 'Istiqlol 48',
        representativeName: 'Karimov Anvar',
        representativePosition: 'Direktor',
      }),
    ).toEqual([]);
  });
});

describe('dates and age', () => {
  it('reads both stored birth-date shapes as the same calendar day', () => {
    // Staff picker: local midnight (19:00Z the day before in Tashkent).
    expect(storedBirthDay(new Date('2008-10-09T19:00:00Z'))).toBe('2008-10-10');
    // Student first-run form: UTC midnight.
    expect(storedBirthDay(new Date('2008-10-10T00:00:00Z'))).toBe('2008-10-10');
  });

  it('turns 18 on the birthday itself', () => {
    expect(isMinorOn('2008-10-10', '2026-10-09')).toBe(true);
    expect(isMinorOn('2008-10-10', '2026-10-10')).toBe(false);
  });

  it('writes a person surname first', () => {
    expect(personName({ firstName: 'Ahror', lastName: 'Soliyev' })).toBe(
      'Soliyev Ahror',
    );
  });
});

describe('customer', () => {
  const student = {
    fullName: 'Soliyev Ahror',
    birthDate: '2000-05-05',
    isMinor: false,
  };

  it('refuses a minor as their own customer', () => {
    expect(customerProblem('SELF', undefined, true)).toMatch(/Voyaga yetmagan/);
    expect(customerProblem('PARENT', undefined, true)).toBeNull();
  });

  it('asks for the basis when the kind is OTHER', () => {
    expect(customerProblem('OTHER', '  ', false)).toMatch(/Boshqa/);
    expect(customerProblem('OTHER', 'amaki', false)).toBeNull();
  });

  it('takes name and birth date from the student for SELF', () => {
    expect(
      buildCustomer(
        { kind: 'SELF', fullName: 'ignored', passport: ' AB1234567 ' },
        student,
      ),
    ).toEqual({
      kind: 'SELF',
      kindOther: null,
      fullName: 'Soliyev Ahror',
      birthDate: '2000-05-05',
      passport: 'AB1234567',
      address: null,
      phone: null,
      telegram: null,
      email: null,
    });
  });

  it('keeps what was typed for a parent, blanks become null', () => {
    expect(
      buildCustomer(
        {
          kind: 'PARENT',
          fullName: ' Soliyeva Malika ',
          birthDate: '1975-01-02',
          phone: '901234567',
          address: '',
        },
        student,
      ),
    ).toMatchObject({
      kind: 'PARENT',
      fullName: 'Soliyeva Malika',
      birthDate: '1975-01-02',
      phone: '901234567',
      address: null,
    });
  });
});

describe('courses', () => {
  it('builds the sealed course block from the enrollment', () => {
    expect(buildCourseFields(enrollment(), 10)).toEqual({
      enrollmentId: 'e-1',
      courseName: 'Standart',
      level: 'A1',
      groupName: '#032',
      teachers: ['Karimova Aziza'],
      startDate: '2026-09-14',
      days: ['monday', 'wednesday', 'friday'],
      lessonStartTime: '14:00',
      lessonEndTime: '15:30',
      lessonsPerWeek: 3,
      lessonMinutes: 90,
      monthlyPrice: 450_000,
      discountPercent: 10,
      firstPaymentAmount: 405_000,
      firstPaymentDate: null,
      discountReason: null,
      discountFrom: null,
      discountTo: null,
      includes: [],
    });
  });

  it('prefers the group lesson length and clamps the discount', () => {
    const c = buildCourseFields(enrollment({ lessonMinutes: 80 }), 150);
    expect(c.lessonMinutes).toBe(80);
    expect(c.discountPercent).toBe(100);
  });

  it('applies the extras an admin typed, in a fixed order', () => {
    expect(
      withExtras(
        {
          firstPaymentAmount: 200_000,
          firstPaymentDate: '2026-10-12',
          discountReason: '  ',
          includes: ['SERTIFIKAT', 'DARSLIK'],
        },
        405_000,
      ),
    ).toEqual({
      firstPaymentAmount: 200_000,
      firstPaymentDate: '2026-10-12',
      discountReason: null,
      discountFrom: null,
      discountTo: null,
      includes: ['DARSLIK', 'SERTIFIKAT'],
    });
  });

  it('names courses for the history row', () => {
    expect(
      courseList([
        { courseName: 'Standart', groupName: '#032' },
        { courseName: 'Intensive', groupName: '#041' },
      ]),
    ).toBe('Standart (#032), Intensive (#041)');
  });
});
```

- [ ] **Step 2: Run it** — `cd server && npx jest src/contract-documents/contract-fields.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `contract-fields.ts`:

```ts
import { applyDiscount, clampDiscount } from '../billing/monthly-price';
import { tashkentDateStr } from '../common/date/tashkent';
import { ageOn } from '../students/shared/student-onboarding';

/** The contract text in force (ADR-0075): 1 = the 02.10.2026 final text. */
export const CONTRACT_TEMPLATE_VERSION = 1;

/** Under this age the student is not their own customer (contract, preamble). */
export const ADULT_AGE = 18;

export const CUSTOMER_KINDS = ['SELF', 'PARENT', 'GUARDIAN', 'OTHER'] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const CONTRACT_INCLUDES = [
  'DARSLIK',
  'MATERIALLAR',
  'ICHKI_TEST',
  'SERTIFIKAT',
] as const;
export type ContractInclude = (typeof CONTRACT_INCLUDES)[number];

/** BUYURTMACHI block of the contract. */
export interface ContractCustomer {
  kind: CustomerKind;
  kindOther: string | null;
  fullName: string;
  birthDate: string | null;
  passport: string | null;
  address: string | null;
  phone: string | null;
  telegram: string | null;
  email: string | null;
}

/** What the admin may type per course; editable until the contract is signed. */
export interface ContractCourseExtras {
  firstPaymentAmount: number;
  firstPaymentDate: string | null;
  discountReason: string | null;
  discountFrom: string | null;
  discountTo: string | null;
  includes: ContractInclude[];
}

/** One course of table 2.1, sealed when the contract is created. */
export interface ContractCourseFields extends ContractCourseExtras {
  enrollmentId: string;
  courseName: string;
  level: string | null;
  groupName: string;
  teachers: string[];
  startDate: string;
  days: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  lessonsPerWeek: number;
  lessonMinutes: number | null;
  monthlyPrice: number;
  discountPercent: number;
}

export interface ContractBranchFields {
  name: string;
  city: string;
  address: string;
  representativeName: string;
  representativePosition: string;
}

export interface ContractStudentFields {
  fullName: string;
  birthDate: string;
  isMinor: boolean;
}

/** Everything the PDF prints, stored in `ContractDocument.fields`. */
export interface ContractFields {
  branch: ContractBranchFields;
  student: ContractStudentFields;
  customer: ContractCustomer;
  courses: ContractCourseFields[];
}

/** The customer block as it arrives from the request. */
export interface CustomerInput {
  kind: CustomerKind;
  kindOther?: string;
  fullName: string;
  birthDate?: string;
  passport?: string;
  address?: string;
  phone?: string;
  telegram?: string;
  email?: string;
}

/** The enrollment shape the course block is built from. */
export interface EnrollmentForContract {
  id: string;
  startDate: Date | null;
  createdAt: Date;
  group: {
    name: string;
    level: string | null;
    exactDays: string[];
    lessonStartTime: string | null;
    lessonEndTime: string | null;
    lessonMinutes: number | null;
    course: { name: string; price: number; lessonMinutes: number | null };
    teachers: { teacher: { firstName: string; lastName: string } }[];
  };
}

const BRANCH_FIELD_LABELS = {
  city: 'shahar',
  address: 'manzil',
  representativeName: 'vakil ismi',
  representativePosition: 'vakil lavozimi',
} as const;

export type BranchContractRow = Record<
  keyof typeof BRANCH_FIELD_LABELS,
  string | null
>;

/**
 * Branch settings the contract cannot be printed without. They are sealed
 * into the contract, so a contract made while one is empty stays empty.
 */
export function missingBranchFields(branch: BranchContractRow): string[] {
  return (
    Object.keys(BRANCH_FIELD_LABELS) as (keyof typeof BRANCH_FIELD_LABELS)[]
  )
    .filter((key) => !branch[key]?.trim())
    .map((key) => BRANCH_FIELD_LABELS[key]);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function personName(p: { firstName: string; lastName: string }): string {
  return `${p.lastName} ${p.firstName}`.trim();
}

/**
 * `Student.dateOfBirth` as a calendar day. The staff picker stores local
 * midnight (19:00Z the day before), the student's own form stores UTC
 * midnight; the Tashkent day is right for both.
 */
export function storedBirthDay(dob: Date): string {
  return tashkentDateStr(dob);
}

export function isMinorOn(birthDate: string, day: string): boolean {
  return ageOn(birthDate, day) < ADULT_AGE;
}

export function customerProblem(
  kind: CustomerKind,
  kindOther: string | undefined,
  isMinor: boolean,
): string | null {
  if (kind === 'SELF' && isMinor) {
    return "Voyaga yetmagan o'quvchi o'zi Buyurtmachi bo'la olmaydi — ota-ona yoki vasiyni tanlang";
  }
  if (kind === 'OTHER' && !kindOther?.trim()) {
    return "«Boshqa» tanlangan — vakillik asosini yozing";
  }
  return null;
}

/** SELF takes name and birth date from the student, never from the form. */
export function buildCustomer(
  input: CustomerInput,
  student: ContractStudentFields,
): ContractCustomer {
  const self = input.kind === 'SELF';
  return {
    kind: input.kind,
    kindOther: input.kind === 'OTHER' ? blankToNull(input.kindOther) : null,
    fullName: self ? student.fullName : input.fullName.trim(),
    birthDate: self ? student.birthDate : (input.birthDate ?? null),
    passport: blankToNull(input.passport),
    address: blankToNull(input.address),
    phone: blankToNull(input.phone),
    telegram: blankToNull(input.telegram),
    email: blankToNull(input.email),
  };
}

export function withExtras(
  extras: Partial<ContractCourseExtras>,
  defaultFirstPayment: number,
): ContractCourseExtras {
  return {
    firstPaymentAmount: extras.firstPaymentAmount ?? defaultFirstPayment,
    firstPaymentDate: extras.firstPaymentDate ?? null,
    discountReason: blankToNull(extras.discountReason),
    discountFrom: extras.discountFrom ?? null,
    discountTo: extras.discountTo ?? null,
    includes: CONTRACT_INCLUDES.filter((item) =>
      extras.includes?.includes(item),
    ),
  };
}

const DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/**
 * Table 2.1 for one course. The first payment defaults to the month's price
 * after the student's discount — the monthly charge's own formula
 * (`applyDiscount`), so the contract and the bill agree.
 */
export function buildCourseFields(
  e: EnrollmentForContract,
  discountPercent: number,
  extras: Partial<ContractCourseExtras> = {},
): ContractCourseFields {
  const discount = clampDiscount(discountPercent);
  const wanted = new Set(e.group.exactDays.map((d) => d.trim().toLowerCase()));
  const days = DAY_ORDER.filter((d) => wanted.has(d));
  const price = e.group.course.price;
  return {
    enrollmentId: e.id,
    courseName: e.group.course.name,
    level: blankToNull(e.group.level),
    groupName: e.group.name,
    teachers: e.group.teachers.map((t) => personName(t.teacher)),
    startDate: tashkentDateStr(e.startDate ?? e.createdAt),
    days,
    lessonStartTime: e.group.lessonStartTime,
    lessonEndTime: e.group.lessonEndTime,
    lessonsPerWeek: days.length,
    lessonMinutes: e.group.lessonMinutes ?? e.group.course.lessonMinutes,
    monthlyPrice: price,
    discountPercent: discount,
    ...withExtras(extras, applyDiscount(price, discount)),
  };
}

/** «Standart (#032), Intensive (#041)» — for history rows. */
export function courseList(
  courses: Pick<ContractCourseFields, 'courseName' | 'groupName'>[],
): string {
  return courses.map((c) => `${c.courseName} (${c.groupName})`).join(', ');
}
```

- [ ] **Step 4: Run** — same jest command → PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/contract-documents/contract-fields.ts src/contract-documents/contract-fields.spec.ts
npx eslint src/contract-documents/contract-fields.ts src/contract-documents/contract-fields.spec.ts
cd .. && git add server/src/contract-documents
git commit -m "feat(contract): pure rules for the sealed contract fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Contract number

**Files:**
- Create: `server/src/contract-documents/contract-number.ts`
- Test: `server/src/contract-documents/contract-number.spec.ts`

**Interfaces:**
- Produces: `contractNumberPrefix(year: string): string`, `nextContractSequence(last: string | null, prefix: string): string`, `nextContractNumber(tx: Prisma.TransactionClient, companyId: number, year: string): Promise<string>`.

- [ ] **Step 1: Write the failing test** — `contract-number.spec.ts`:

```ts
import {
  contractNumberPrefix,
  nextContractNumber,
  nextContractSequence,
} from './contract-number';

describe('contract number', () => {
  it('starts every year at 00001', () => {
    expect(nextContractSequence(null, 'DAF-2026-')).toBe('DAF-2026-00001');
  });

  it('continues after the last number of the year', () => {
    expect(nextContractSequence('DAF-2026-00041', 'DAF-2026-')).toBe(
      'DAF-2026-00042',
    );
  });

  it('ignores a number from another prefix', () => {
    expect(nextContractSequence('DAF-2025-00900', 'DAF-2026-')).toBe(
      'DAF-2026-00001',
    );
  });

  it('reads the company last number of the year', async () => {
    const tx = {
      contractDocument: {
        findFirst: jest.fn().mockResolvedValue({ number: 'DAF-2026-00007' }),
      },
    };
    await expect(nextContractNumber(tx as never, 1, '2026')).resolves.toBe(
      'DAF-2026-00008',
    );
    expect(tx.contractDocument.findFirst).toHaveBeenCalledWith({
      where: { companyId: 1, number: { startsWith: 'DAF-2026-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    expect(contractNumberPrefix('2027')).toBe('DAF-2027-');
  });
});
```

- [ ] **Step 2: Run it** — `npx jest src/contract-documents/contract-number.spec.ts` → FAIL.

- [ ] **Step 3: Implement** — `contract-number.ts`:

```ts
import type { Prisma } from '@prisma/client';

export function contractNumberPrefix(year: string): string {
  return `DAF-${year}-`;
}

/** Five digits keep the text order equal to the number order. */
export function nextContractSequence(
  last: string | null,
  prefix: string,
): string {
  const n =
    last && last.startsWith(prefix)
      ? Number.parseInt(last.slice(prefix.length), 10)
      : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}

/**
 * Called inside the Serializable create transaction: two concurrent creates
 * conflict there, or hit `@@unique([companyId, number])` — both become 409.
 */
export async function nextContractNumber(
  tx: Prisma.TransactionClient,
  companyId: number,
  year: string,
): Promise<string> {
  const prefix = contractNumberPrefix(year);
  const last = await tx.contractDocument.findFirst({
    where: { companyId, number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return nextContractSequence(last?.number ?? null, prefix);
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/contract-documents/contract-number.ts src/contract-documents/contract-number.spec.ts
npx eslint src/contract-documents/contract-number.ts src/contract-documents/contract-number.spec.ts
cd .. && git add server/src/contract-documents
git commit -m "feat(contract): DAF-YYYY-NNNNN contract numbers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Contract text, version 1

**Files:**
- Create: `server/src/contract-documents/pdf/contract-template-v1.ts`
- Test: `server/src/contract-documents/pdf/contract-template-v1.spec.ts`
- Reads: `docs/tolov-savollari/shartnoma-2026-yakuniy.txt` (already committed — the plain text of the 02.10 Word file)

**Interfaces:**
- Produces constants: `TITLE`, `PREAMBLE`, `MINOR_NOTE`, `SECTION_1_TITLE`, `EXECUTOR_TITLE`, `CUSTOMER_TITLE`, `STUDENT_TITLE`, `COMPANY_NAME`, `COMPANY_TIN`, `COMPANY_LICENSE`, `SECTION_2_TITLE`, `SECTION_2_INTRO`, `LANGUAGE`, `NEXT_PAYMENTS`, `SECTION_2_TAIL: string[]`, `BODY_SECTIONS: { title: string; items: string[] }[]`, `SECTION_11_TITLE`, `EXECUTOR_LINES: string[]`, `LICENSE_LINE: string[]`, `MARKETING_TITLE`, `MARKETING_ROWS: string[]`, `MARKETING_SIGN_LABEL`, `MARKETING_NOTE`.

- [ ] **Step 1: Write the failing test** — `contract-template-v1.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import * as T from './contract-template-v1';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

// The plain text of the 02.10.2026 Word file (docs/tolov-savollari).
const reference = readFileSync(
  join(__dirname, '../../../../docs/tolov-savollari/shartnoma-2026-yakuniy.txt'),
  'utf8',
)
  .split('\n')
  .map(norm)
  .filter(Boolean);
const lines = new Set(reference);

describe('contract template v1', () => {
  it('copies every static paragraph of the 02.10 text word for word', () => {
    const statics = [
      T.TITLE,
      T.PREAMBLE,
      T.MINOR_NOTE,
      T.SECTION_1_TITLE,
      T.EXECUTOR_TITLE,
      T.CUSTOMER_TITLE,
      T.STUDENT_TITLE,
      T.SECTION_2_TITLE,
      T.SECTION_2_INTRO,
      ...T.SECTION_2_TAIL,
      ...T.BODY_SECTIONS.flatMap((s) => [s.title, ...s.items]),
      T.SECTION_11_TITLE,
      T.MARKETING_TITLE,
      T.MARKETING_NOTE,
    ];
    expect(statics.map(norm).filter((s) => !lines.has(s))).toEqual([]);
  });

  it('drops no clause of the reference', () => {
    const clauses = reference.filter(
      (l) => /^(\d+\.\d+\.|— )/.test(l) && !l.includes(' | '),
    );
    const ours = new Set(
      [
        T.SECTION_2_INTRO,
        ...T.SECTION_2_TAIL,
        ...T.BODY_SECTIONS.flatMap((s) => s.items),
      ].map(norm),
    );
    expect(clauses.filter((l) => !ours.has(l))).toEqual([]);
  });

  it('takes the fixed table texts from the reference', () => {
    expect(lines.has(norm(`Tashkilot nomi | ${T.COMPANY_NAME}`))).toBe(true);
    expect(lines.has(norm(`STIR | ${T.COMPANY_TIN}`))).toBe(true);
    expect(lines.has(norm(`Litsenziya | ${T.COMPANY_LICENSE}`))).toBe(true);
    expect(
      lines.has(norm(`Keyingi to'lovlar muddati | ${T.NEXT_PAYMENTS}`)),
    ).toBe(true);
    expect(lines.has(norm(T.LICENSE_LINE.join(' | ')))).toBe(true);
    const requisites = reference.find((l) =>
      l.startsWith('«Daf Sprachzentrum» MCHJ / Yuridik manzil'),
    );
    for (const line of T.EXECUTOR_LINES) {
      expect(requisites).toContain(norm(line));
    }
    for (const label of [...T.MARKETING_ROWS, T.MARKETING_SIGN_LABEL]) {
      expect(reference.some((l) => l.startsWith(`${label} |`))).toBe(true);
    }
  });

  it('sends disputes to the Namangan court for every branch', () => {
    const disputes = T.BODY_SECTIONS.find((s) => s.title.startsWith('9.'));
    expect(disputes?.items.join(' ')).toContain(
      'Namangan shahar fuqarolik ishlari sudida',
    );
  });
});
```

- [ ] **Step 2: Run it** — `npx jest src/contract-documents/pdf/contract-template-v1.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Write the template** — `contract-template-v1.ts` (copy exactly; every string below is the reference text):

```ts
/**
 * The contract text, version 1 = the final text of 02.10.2026
 * (docs/tolov-savollari/shartnoma-2026-yakuniy.docx). Never edit a
 * published version: a lawyer's change becomes `contract-template-v2.ts` and
 * contracts keep the version they were made with (ADR-0075). The spec next to
 * this file compares every string with the reference text.
 */

export const TITLE = "TA'LIM XIZMATI KO'RSATISH SHARTNOMASI";

export const PREAMBLE =
  "«Daf Sprachzentrum» MCHJ, keyingi o'rinlarda «Ijrochi» deb ataluvchi bir tomondan, hamda quyida ma'lumotlari ko'rsatilgan shaxs, keyingi o'rinlarda «Buyurtmachi» deb ataluvchi ikkinchi tomondan, birgalikda «Tomonlar» deb atalib, O'zbekiston Respublikasi Fuqarolik Kodeksining 703–711-moddalari hamda «Ta'lim to'g'risida»gi Qonunga muvofiq ushbu shartnomani (keyingi o'rinlarda — Shartnoma) tuzdilar.";

export const MINOR_NOTE =
  "Izoh: Ta'lim oluvchi 18 yoshga to'lmagan bo'lsa, Shartnomani uning ota-onasi yoki qonuniy vakili Buyurtmachi sifatida imzolaydi va barcha huquqiy majburiyatlarni o'z zimmasiga oladi.";

export const SECTION_1_TITLE = "1. TOMONLAR HAQIDAGI MA'LUMOTLAR";
export const EXECUTOR_TITLE = "IJROCHI (Ta'lim markazi)";
export const CUSTOMER_TITLE = "BUYURTMACHI (To'lovchi tomon)";
export const STUDENT_TITLE =
  "TA'LIM OLUVCHI (agar Buyurtmachi bilan mos kelmasa)";

export const COMPANY_NAME = '«Daf Sprachzentrum» MCHJ';
export const COMPANY_TIN = '309813904';
export const COMPANY_LICENSE = '№068844, «14» mart 2023 y.';

export const SECTION_2_TITLE = '2. SHARTNOMA PREDMETI VA KURS SHARTLARI';
export const SECTION_2_INTRO =
  "2.1. Ijrochi Ta'lim oluvchiga quyidagi parametrlar asosida xorijiy til bo'yicha qo'shimcha ta'lim xizmatini ko'rsatadi, Buyurtmachi esa mazkur xizmatni qabul qilib haqini to'laydi:";

/** The centre teaches German only; checked against production in Task 15. */
export const LANGUAGE = 'Nemis tili';

export const NEXT_PAYMENTS =
  "Har oyning 2-darsigacha kamida 50%, qolgani — to'langan darslar tugaguncha (3.2-band)";

export const SECTION_2_TAIL = [
  "2.2. Zarur bo'lsa, Ijrochi kirish testi o'tkazadi va daraja yoki guruhga o'zgartirish tavsiya qilishi mumkin; o'zgartirish Buyurtmachi bilan kelishiladi. Oy davomida kurs yoki guruh o'zgarsa, joriy oy uchun to'lov har bir kurs bo'yicha shu oydagi darslar soniga mutanosib qayta hisoblanadi; o'zgarish qo'shimcha kelishuv bilan rasmiylashtiriladi.",
  "2.3. Kurs til ko'nikmalarini rivojlantirishga qaratilgan. Tashqi sertifikat (CEFR, Goethe, IELTS va h.k.) olish, viza yoki ish joyi olish vakolatiga ega emas hamda hech qanday kafolat bermaydi.",
];

export const BODY_SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "3. TO'LOV TARTIBI",
    items: [
      "3.1. To'lov bank kartasi, Click, Payme, QR-kod yoki bank o'tkazmasi orqali amalga oshiriladi. Ijrochi fiskal chek yoki boshqa qonuniy tasdiqlovchi hujjat beradi.",
      "3.2. Har oy to'lovining kamida 50 foizi shu oyning 2-darsigacha (birinchi oy uchun — Ta'lim oluvchining 2-darsigacha), qolgan qismi esa to'langan darslar tugaguniga qadar to'lanadi. Oyning birinchi darsiga to'lovsiz qatnashish mumkin. 2-darsdan boshlab Ta'lim oluvchi shu oy to'lovining kamida 50 foizi to'langandan keyin darslarga qo'yiladi va faqat to'lovi yetgan darslarga qatnashadi. To'lov avval eski qarzni yopadi; oldingi oydan o'tgan to'lov, shu jumladan oy o'rtasida boshlaganda ortib qolgan summa, shu oy to'loviga qo'shiladi. To'lov qilinmagani sababli qatnashilmagan darslar Buyurtmachi aybi bilan qoldirilgan hisoblanadi: ular qayta tiklanmaydi va oylik to'lov qayta hisoblanmaydi. Darslarga qo'yilmaslik ko'rsatilgan xizmatlar uchun qarzni bekor qilmaydi.",
      "3.3. Narx va muhim shartlar faqat Tomonlarning yozma qo'shimcha kelishuvi bilan o'zgartiriladi. Joriy to'langan oyning narxi bir tomonlama o'zgartirilmaydi.",
      "3.4. Oylik to'lov kalendar oy uchun belgilanadi va oydagi darslar soniga qarab o'zgarmaydi. 1 dars qiymati oylik to'lovni shu oyda guruh jadvali bo'yicha rejalashtirilgan darslar soniga bo'lish orqali aniqlanadi va oy o'rtasida boshlanganda, kurs o'zgarganda hamda 6.2-band bo'yicha hisob-kitobda qo'llaniladi. Oy o'rtasida boshlagan Ta'lim oluvchi shu oyning qolgan darslari uchun to'laydi. Daraja oy o'rtasida yakunlansa, shu oy uchun faqat daraja yakunlanguniga qadar o'tilgan darslar haqi 1 dars qiymati bo'yicha to'lanadi; bu 6.2-band bo'yicha bekor qilish hisoblanmaydi.",
      "3.5. Ijrochida birinchi marta ta'lim olayotgan Ta'lim oluvchining birinchi darsi sinov darsi hisoblanadi: shu darsdan keyin shartnoma bekor qilinsa, birinchi dars uchun to'lov talab qilinmaydi.",
      "3.6. Chegirma 2.1-bandda ko'rsatilgan miqdorda va muddatga beriladi. Muddat tugagach, to'lov 2.1-banddagi kurs haqi miqdorida davom etadi. Chegirmani muddatidan oldin bekor qilish qo'shimcha kelishuv bilan amalga oshiriladi.",
      "3.7. Oy to'lovi qisman to'langan bo'lsa, Ijrochi to'langan darslar tugashidan 3 kalendar kun oldin boshlab Buyurtmachiga qolgan qismini to'lash haqida eslatma yuboradi. Eslatma olinmagani to'lov muddatini o'zgartirmaydi.",
    ],
  },
  {
    title: '4. TOMONLARNING HUQUQ VA MAJBURIYATLARI',
    items: [
      '4.1. Ijrochi MAJBURIYATLARI:',
      "— belgilangan jadval, hajm va formatda ta'lim jarayonini tashkil etish;",
      '— malakali pedagog jalb qilish; pedagog almashtirilganda Buyurtmachini oldindan xabardor qilish;',
      "— Ijrochi aybi bilan o'tilmagan darsni boshqa kunga (zarur bo'lsa keyingi oyga) ko'chirib o'tish, bu imkonsiz bo'lsa — summani qayta hisoblash;",
      "— kurs, narx va materiallar haqida to'g'ri axborot berish;",
      "— shaxsga doir ma'lumotlarni qonunchilikka muvofiq maxfiy saqlash.",
      "4.2. Buyurtmachi / Ta'lim oluvchi MAJBURIYATLARI:",
      "— to'lovlarni belgilangan muddatda amalga oshirish;",
      "— darslarga o'z vaqtida qatnashish, topshiriqlarni bajarish;",
      '— ichki tartib va odob-axloq qoidalariga rioya qilish;',
      "— aloqa ma'lumotlaridagi o'zgarishlarni darhol xabar berish;",
      "— voyaga yetmagan Ta'lim oluvchining maktab tashqarisidagi xavfsizligi uchun Buyurtmachi (ota-ona / vasiy) javobgar bo'ladi — Ijrochi alohida yozma nazorat majburiyatini olmagan bo'lsa.",
    ],
  },
  {
    title: '5. DAVOMAT VA QOLDIRILGAN DARSLAR',
    items: [
      "5.1. Guruh darsiga kelmaslik haqida kamida 24 soat oldin xabar beriladi. Xabarsiz qoldirilgan guruh darsi qayta tiklanmaydi va to'lov qayta hisoblanmaydi. Uzrli sabab (hujjat bilan tasdiqlangan) bilan va kamida 24 soat oldin xabar berib qoldirilgan guruh darsi imkon qadar qayta o'tiladi; imkon bo'lmasa, keyingi oy to'lovidan keyingi oyning 1 dars qiymati (3.4-band) chegiriladi.",
      "5.2. Individual dars kamida 24 soat oldin bekor qilinsa, boshqa vaqtga ko'chiriladi. Kechroq bekor qilingan yoki sababsiz qoldirilgan dars o'tilgan deb hisoblanadi.",
      "5.3. Kasallik yoki boshqa uzrli sabab (hujjat bilan tasdiqlangan) 10 kalendar kundan ortiq davom etsa, kurs bir marta 30 kungacha muzlatilishi mumkin. Qayta boshlash sanasi yozma kelishiladi. Ta'lim oluvchi kelishilgan sanada darsga qaytmasa, shartnoma muzlatish boshlangan kundan Buyurtmachi tomonidan bekor qilingan hisoblanadi va 6.2-band shu sana bo'yicha qo'llaniladi.",
    ],
  },
  {
    title: '6. SHARTNOMANI BEKOR QILISH VA PUL QAYTARISH',
    items: [
      '6.1. Buyurtmachi shartnomani istalgan vaqt yozma yoki elektron xabar orqali bekor qilishi mumkin.',
      '6.2. Pul qaytarish shartlari:',
      "— Kurs boshlanishidan OLDIN Buyurtmachi bekor qilsa: to'langan summa 10 bank kuni ichida to'liq qaytariladi (agar to'lov jarayonida hisob raqamga kelib tushgan mablag'dan bank, vositachi (komissioner), soliq yoki boshqa xarajatlar amalga oshirilgan bo'lsa, mazkur xarajatlar qaytarib berilmaydi).",
      "— Kurs boshlanganidan so'ng Buyurtmachi bekor qilsa: amalda o'tilgan darslar qiymati ushlab qolinadi, qolgan qismi 10 bank kuni ichida qaytariladi.",
      "— Joriy to'langan oy darslarining 40% dan ko'prog'i o'tilgan bo'lsa: shu oy uchun pul qaytarilmaydi.",
      "— Ijrochi tashabbusi bilan (intizom qoidalari qo'pol buzilganda): amalda ko'rsatilgan xizmatlar asosida hisob-kitob qilinadi.",
      "6.3. Ta'lim oluvchi 3.2-band bo'yicha darsga qo'yilmagan yoki darslarni ketma-ket xabarsiz qoldirgan bo'lsa va shundan keyin 14 kalendar kun ichida darsga qaytmasa, shartnoma xizmat ko'rsatish to'xtagan kundan Buyurtmachi tomonidan bekor qilingan hisoblanadi va 6.2-band shu sana bo'yicha qo'llaniladi.",
      "6.4. Qaytarilishi lozim bo'lgan summani Buyurtmachi qaytarish muddati tugaganidan keyin 30 kalendar kun ichida olmasa (rekvizitlarini taqdim etmasa yoki murojaat qilmasa), Ijrochi uni kamida bir marta xabardor qilgach, mazkur summa Ijrochi hisobiga o'tkaziladi.",
    ],
  },
  {
    title: "7. SHAXSGA DOIR MA'LUMOTLAR VA MAXFIYLIK",
    items: [
      "7.1. Ijrochi shartnomada ko'rsatilgan ma'lumotlarni faqat ta'lim xizmatini ko'rsatish va qonuniy majburiyatlarni bajarish maqsadida qayta ishlaydi.",
      "7.2. Qonuniy asos bo'lmasa, ma'lumotlar uchinchi shaxslarga berilmaydi. Reklama va foto/video tasvirni e'lon qilish uchun alohida rozilik olinadi. Rozilik bermaslik ta'lim olishga to'sqinlik qilmaydi.",
    ],
  },
  {
    title: '8. FORS-MAJOR',
    items: [
      "8.1. Tomonlar nazoratidan tashqaridagi, oldindan ko'rish va bartaraf etib bo'lmaydigan holat (tabiiy ofat, epidemiya, davlat organi qarori va h.k.) majburiyatni imkonsiz qilsa, ta'sir ko'rgan taraf imkon qadar tez xabar beradi va tegishli davr uchun javobgarlikdan ozod bo'ladi.",
      "8.2. Bunday holat 30 kundan ortiq davom etsa, Tomonlar muqobil format yoki foydalanilmagan xizmatlar bo'yicha hisob-kitob qilib shartnomani bekor qilishni kelishadi.",
    ],
  },
  {
    title: '9. NIZOLARNI HAL QILISH',
    items: [
      '9.1. Barcha nizolar avvalo muzokara va yozma murojaat orqali hal qilinadi.',
      "9.2. Kelishuvga erishilmasa, nizo O'zbekiston Respublikasi qonunchiligiga muvofiq Namangan shahar fuqarolik ishlari sudida ko'riladi. Iste'molchining vakolatli davlat organlariga murojaat qilish huquqi cheklanmaydi.",
    ],
  },
  {
    title: '10. SHARTNOMANING AMAL QILISH MUDDATI',
    items: [
      "10.1. Shartnoma Tomonlar imzolagan (yoki Buyurtmachi 10.4-band bo'yicha elektron tasdiqlagan) kundan kuchga kiradi va 2-bo'limda ko'rsatilgan kurs yakunlanib, Tomonlar majburiyatlari to'liq bajarilguniga qadar amal qiladi.",
      "10.2. Shartnomaga o'zgartirish faqat Tomonlar imzolagan yozma qo'shimcha kelishuv (voyaga yetgan Buyurtmachi uchun — 10.4-band bo'yicha elektron tasdiqlangan qo'shimcha kelishuv ham) orqali kiritiladi.",
      "10.3. Qog'ozda tuzilganda shartnoma ikki nusxada tuziladi; har bir nusxa teng yuridik kuchga ega.",
      "10.4. Voyaga yetgan Buyurtmachi shartnoma va qo'shimcha kelishuvlarni Ijrochining Telegram boti yoki shaxsiy kabineti orqali «Roziman» tugmasini bosib tasdiqlashi mumkin; bunday tasdiq Buyurtmachining qo'lda qo'ygan imzosi bilan teng kuchga ega. Ijrochi tasdiq sanasi, vaqti va tasdiqlangan matnni saqlaydi. Ta'lim oluvchi voyaga yetmagan bo'lsa, shartnoma va qo'shimcha kelishuvlar faqat uning ota-onasi yoki qonuniy vakili tomonidan qog'ozda imzolanadi.",
    ],
  },
];

export const SECTION_11_TITLE = '11. TOMONLARNING REKVIZITLARI VA IMZOLARI';

export const EXECUTOR_LINES = [
  '«Daf Sprachzentrum» MCHJ',
  "Yuridik manzil: Namangan sh., A. Xo'jayev ko'chasi, 38a",
  'STIR: 309813904',
  'H/r: 20208000805569631001',
  'Bank: AT Turonbank   MFO: 00446',
  'Tel: +998 88 388 55 50',
  'Email: info@dafzentrum.uz',
];

export const LICENSE_LINE = [
  'Litsenziya №068844',
  '«14» mart 2023 y.',
  "O'zbekiston Respublikasi MMTV",
];

export const MARKETING_TITLE = 'IXTIYORIY MARKETING ROZILIGI';
export const MARKETING_ROWS = [
  'Reklama xabarlarini olish',
  "Foto/video tasvirni reklamada e'lon qilish",
];
export const MARKETING_SIGN_LABEL = 'Rozilik imzosi va sana';
export const MARKETING_NOTE =
  "ESLATMA: marketing roziligi ixtiyoriy. Uni bermaslik yoki keyinchalik qaytarib olish ta'lim xizmatining davom ettirilishiga ta'sir qilmaydi.";
```

- [ ] **Step 4: Run** → PASS. If a string fails, compare it with the reference line character by character (apostrophes are ASCII `'`, dashes `—` and `–` as in the reference) and fix the template, never the reference.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/contract-documents/pdf/contract-template-v1.ts src/contract-documents/pdf/contract-template-v1.spec.ts
npx eslint src/contract-documents/pdf/contract-template-v1.ts src/contract-documents/pdf/contract-template-v1.spec.ts
cd .. && git add server/src/contract-documents/pdf
git commit -m "feat(contract): version 1 of the contract text, checked against the 02.10 file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Contract PDF

**Before coding:** invoke the `pdf` skill (client/CLAUDE.md makes it mandatory for PDF work).

**Files:**
- Create: `server/src/contract-documents/pdf/contract-pdf.ts`
- Test: `server/src/contract-documents/pdf/contract-pdf.spec.ts`

**Interfaces:**
- Consumes: Task 3 `fullWeekdaysLabel`, `uzMonthName`; Task 4 types; Task 6 constants; `renderPdf` (`receipts/pdf/render`).
- Produces: `interface ContractPdfInput { number: string; contractDate: string; cancelled: boolean; templateVersion: number; fields: ContractFields }`, `contractDocDefinition(input): TDocumentDefinitions`, `renderContractPdf(input): Promise<Buffer>`, helpers `dmy`, `headerDate`, `som`, `formatPhone`, `kindLine`.

- [ ] **Step 1: Write the failing test** — `contract-pdf.spec.ts`:

```ts
import type { ContractFields } from '../contract-fields';
import {
  contractDocDefinition,
  dmy,
  formatPhone,
  headerDate,
  kindLine,
  renderContractPdf,
  som,
  type ContractPdfInput,
} from './contract-pdf';

const course = {
  enrollmentId: 'e-1',
  courseName: 'Standart',
  level: 'A1',
  groupName: '#032',
  teachers: ['Karimova Aziza'],
  startDate: '2026-09-14',
  days: ['monday', 'wednesday', 'friday'],
  lessonStartTime: '14:00',
  lessonEndTime: '15:30',
  lessonsPerWeek: 3,
  lessonMinutes: 90,
  monthlyPrice: 450_000,
  discountPercent: 10,
  firstPaymentAmount: 405_000,
  firstPaymentDate: '2026-10-12',
  discountReason: "Aka-uka o'qiydi",
  discountFrom: null,
  discountTo: null,
  includes: ['DARSLIK' as const],
};

const fields = (over: Partial<ContractFields> = {}): ContractFields => ({
  branch: {
    name: 'Namangan filiali',
    city: 'Namangan',
    address: "Istiqlol ko'chasi, 48",
    representativeName: 'Karimov Anvar',
    representativePosition: 'Direktor',
  },
  student: { fullName: 'Soliyev Ahror', birthDate: '2010-05-05', isMinor: true },
  customer: {
    kind: 'PARENT',
    kindOther: null,
    fullName: 'Soliyeva Malika',
    birthDate: null,
    passport: null,
    address: null,
    phone: '901234567',
    telegram: '@malika',
    email: null,
  },
  courses: [course],
  ...over,
});

const input = (over: Partial<ContractPdfInput> = {}): ContractPdfInput => ({
  number: 'DAF-2026-00001',
  contractDate: '2026-10-10',
  cancelled: false,
  templateVersion: 1,
  fields: fields(),
  ...over,
});

const text = (node: unknown) => JSON.stringify(node);

describe('contract pdf helpers', () => {
  it('formats days, money and phones the Uzbek way', () => {
    expect(dmy('2026-10-10')).toBe('10.10.2026');
    expect(headerDate('2026-10-10')).toBe('«10» oktabr 2026 yil');
    expect(som(1_500_000)).toBe("1 500 000 so'm");
    expect(formatPhone('901234567')).toBe('+998 90 123 45 67');
  });

  it('ticks the chosen representation basis', () => {
    expect(kindLine(fields().customer)).toBe(
      "□ o'zi   ■ ota-ona   □ vasiy / homiy   □ boshqa: _________",
    );
  });
});

describe('contractDocDefinition', () => {
  it('fills the header, parties and the course table', () => {
    const doc = text(contractDocDefinition(input()).content);
    expect(doc).toContain('№ DAF-2026-00001');
    expect(doc).toContain('Namangan shahri');
    expect(doc).toContain('«10» oktabr 2026 yil');
    expect(doc).toContain('Karimov Anvar / Direktor');
    expect(doc).toContain('Soliyeva Malika');
    expect(doc).toContain('+998 90 123 45 67 / @malika');
    expect(doc).toContain('■ voyaga yetmagan (18 yoshdan kichik)');
    expect(doc).toContain('Nemis tili, A1');
    expect(doc).toContain('#032 / Karimova Aziza');
    expect(doc).toContain('Kunlar: Dushanba, Chorshanba, Juma   Vaqt: 14:00–15:30');
    expect(doc).toContain("450 000 so'm");
    expect(doc).toContain("10 %   |   Sababi: Aka-uka o'qiydi");
    expect(doc).toContain("405 000 so'm   |   To'lov sanasi: 12.10.2026");
    expect(doc).toContain('■ Darslik   □ Materiallar   □ Ichki test   □ Sertifikat');
    expect(doc).toContain('Namangan shahar fuqarolik ishlari sudida');
  });

  it('leaves a line where the admin typed nothing', () => {
    const doc = text(contractDocDefinition(input()).content);
    expect(doc).toContain('Pasport / ID seriya, raqami');
    expect(doc).toContain('____________________');
  });

  it('numbers the courses when there are several', () => {
    const doc = text(
      contractDocDefinition(
        input({ fields: fields({ courses: [course, { ...course, enrollmentId: 'e-2' }] }) }),
      ).content,
    );
    expect(doc).toContain('1-kurs');
    expect(doc).toContain('2-kurs');
  });

  it('marks a cancelled contract on every page', () => {
    const live = contractDocDefinition(input());
    expect(live.background).toBeUndefined();
    const cancelled = contractDocDefinition(input({ cancelled: true }));
    const bg = (cancelled.background as (p: number, s: { width: number; height: number }) => unknown)(1, { width: 595, height: 842 });
    expect(text(bg)).toContain('BEKOR QILINGAN');
  });

  it('refuses a text version it does not know', () => {
    expect(() => contractDocDefinition(input({ templateVersion: 2 }))).toThrow();
  });

  it('renders a real PDF', async () => {
    const buf = await renderContractPdf(input());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
```

- [ ] **Step 2: Run it** — `npx jest src/contract-documents/pdf/contract-pdf.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `contract-pdf.ts`:

```ts
import type {
  Content,
  ContentTable,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { renderPdf } from '../../receipts/pdf/render';
import {
  fullWeekdaysLabel,
  uzMonthName,
} from '../../telegram-digest/uzbek-calendar';
import {
  CONTRACT_INCLUDES,
  CONTRACT_TEMPLATE_VERSION,
  type ContractCourseFields,
  type ContractCustomer,
  type ContractFields,
  type ContractInclude,
  type CustomerKind,
} from '../contract-fields';
import * as T from './contract-template-v1';

export interface ContractPdfInput {
  number: string;
  /** YYYY-MM-DD, the Tashkent day the contract was made. */
  contractDate: string;
  cancelled: boolean;
  templateVersion: number;
  fields: ContractFields;
}

const MM = 72 / 25.4;
const LINE = '____________________';

const GRID: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#8A8A8A',
  vLineColor: () => '#8A8A8A',
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

const INCLUDE_LABEL: Record<ContractInclude, string> = {
  DARSLIK: 'Darslik',
  MATERIALLAR: 'Materiallar',
  ICHKI_TEST: 'Ichki test',
  SERTIFIKAT: 'Sertifikat',
};

const KINDS: { kind: CustomerKind; label: string }[] = [
  { kind: 'SELF', label: "o'zi" },
  { kind: 'PARENT', label: 'ota-ona' },
  { kind: 'GUARDIAN', label: 'vasiy / homiy' },
  { kind: 'OTHER', label: 'boshqa:' },
];

export function dmy(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}`;
}

export function headerDate(day: string): string {
  const [y, m, d] = day.split('-');
  return `«${d}» ${uzMonthName(Number(m))} ${y} yil`;
}

export function som(amount: number): string {
  const digits = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${digits} so'm`;
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local =
    digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits;
  if (local.length !== 9) return raw;
  return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

const orLine = (value: string | null | undefined, blank = LINE): string =>
  value && value.trim() ? value : blank;
const box = (on: boolean): string => (on ? '■' : '□');
const blankDate = (year: string): string => `____/____/${year}`;

/** «□ o'zi   ■ ota-ona   …» — the paper form's checkbox row, ticked. */
export function kindLine(c: ContractCustomer): string {
  return KINDS.map(({ kind, label }) => {
    const mark = `${box(c.kind === kind)} ${label}`;
    if (kind !== 'OTHER') return mark;
    return `${mark} ${c.kind === 'OTHER' ? orLine(c.kindOther, '_________') : '_________'}`;
  }).join('   ');
}

function row(label: string, value: string): TableCell[] {
  return [{ text: label, bold: true }, { text: value }];
}

function grid(
  body: TableCell[][],
  widths: (number | string)[] = [140, '*'],
): ContentTable {
  return { table: { widths, body }, layout: GRID, margin: [0, 2, 0, 6] };
}

function heading(text: string): Content {
  return { text, bold: true, fontSize: 10, margin: [0, 10, 0, 4] };
}

function caption(text: string): Content {
  return { text, bold: true, margin: [0, 4, 0, 2] };
}

function paragraph(text: string): Content {
  return text.startsWith('— ')
    ? { text, alignment: 'justify', margin: [12, 0, 0, 2] }
    : { text, alignment: 'justify', margin: [0, 0, 0, 3] };
}

function line(text: string): Content {
  return { text, margin: [0, 0, 0, 2] };
}

function parties(f: ContractFields): Content[] {
  const c = f.customer;
  const self = c.kind === 'SELF';
  const contact = [c.phone ? formatPhone(c.phone) : null, c.telegram]
    .filter((v): v is string => Boolean(v))
    .join(' / ');
  const minor = `${box(f.student.isMinor)} voyaga yetmagan (18 yoshdan kichik)`;
  return [
    heading(T.SECTION_1_TITLE),
    caption(T.EXECUTOR_TITLE),
    grid([
      row('Tashkilot nomi', T.COMPANY_NAME),
      row('Filial manzili', f.branch.address),
      row('STIR', T.COMPANY_TIN),
      row('Litsenziya', T.COMPANY_LICENSE),
      row(
        'Vakil / Lavozimi',
        `${f.branch.representativeName} / ${f.branch.representativePosition}`,
      ),
    ]),
    caption(T.CUSTOMER_TITLE),
    grid([
      row('F.I.O.', c.fullName),
      row("Tug'ilgan sana", c.birthDate ? dmy(c.birthDate) : '____/____/________'),
      row('Pasport / ID seriya, raqami', orLine(c.passport)),
      row('Yashash manzili', orLine(c.address)),
      row('Telefon / Telegram', orLine(contact)),
      row('E-mail', orLine(c.email)),
    ]),
    caption(T.STUDENT_TITLE),
    grid([
      row('F.I.O.', self ? "Buyurtmachining o'zi" : f.student.fullName),
      row(
        "Tug'ilgan sana",
        self ? '—' : `${dmy(f.student.birthDate)}     ${minor}`,
      ),
      row('Vakillik asosi', kindLine(c)),
    ]),
  ];
}

function courseTable(course: ContractCourseFields, year: string): ContentTable {
  const days = fullWeekdaysLabel(course.days);
  const time =
    course.lessonStartTime && course.lessonEndTime
      ? `${course.lessonStartTime}–${course.lessonEndTime}`
      : orLine(course.lessonStartTime, '________________');
  const discount =
    course.discountPercent > 0
      ? `${course.discountPercent} %   |   Sababi: ${orLine(course.discountReason, '______________')}   |   Muddati: ${course.discountFrom ? dmy(course.discountFrom) : blankDate(year)} – ${course.discountTo ? dmy(course.discountTo) : blankDate(year)}`
      : "yo'q";
  return grid([
    row(
      'Til va daraja',
      course.level ? `${T.LANGUAGE}, ${course.level}` : T.LANGUAGE,
    ),
    row('Kurs turi', course.courseName),
    row(
      'Guruh / pedagog',
      course.teachers.length
        ? `${course.groupName} / ${course.teachers.join(', ')}`
        : course.groupName,
    ),
    row('Kurs boshlanish sanasi', dmy(course.startDate)),
    row('Dars jadvali', `Kunlar: ${orLine(days, '_______________')}   Vaqt: ${time}`),
    row(
      'Haftasiga darslar soni',
      `${course.lessonsPerWeek > 0 ? course.lessonsPerWeek : '________'} marta (oydagi darslar soni kalendarga qarab o'zgaradi)   |   1 dars = ${course.lessonMinutes ?? '________'} daqiqa`,
    ),
    row('Kurs haqi (oylik)', som(course.monthlyPrice)),
    row('Chegirma', discount),
    row(
      "Dastlabki to'lov",
      `${som(course.firstPaymentAmount)}   |   To'lov sanasi: ${course.firstPaymentDate ? dmy(course.firstPaymentDate) : blankDate(year)}`,
    ),
    row("Keyingi to'lovlar muddati", T.NEXT_PAYMENTS),
    row(
      'Kurs ichiga kiradigan narsa',
      CONTRACT_INCLUDES.map(
        (item) => `${box(course.includes.includes(item))} ${INCLUDE_LABEL[item]}`,
      ).join('   '),
    ),
  ]);
}

function subject(f: ContractFields, year: string): Content[] {
  const many = f.courses.length > 1;
  return [
    heading(T.SECTION_2_TITLE),
    paragraph(T.SECTION_2_INTRO),
    ...f.courses.flatMap((course, i): Content[] => [
      ...(many ? [caption(`${i + 1}-kurs`)] : []),
      courseTable(course, year),
    ]),
    ...T.SECTION_2_TAIL.map(paragraph),
  ];
}

function body(): Content[] {
  return T.BODY_SECTIONS.flatMap((s): Content[] => [
    heading(s.title),
    ...s.items.map(paragraph),
  ]);
}

function requisites(f: ContractFields, contractDate: string): Content[] {
  const c = f.customer;
  const day = dmy(contractDate);
  const executor = [
    ...T.EXECUTOR_LINES,
    "Imzo: ___________________  M.O'.",
    `F.I.O.: ${f.branch.representativeName}`,
    `Sana: ${day}`,
  ];
  const customer = [
    `F.I.O.: ${c.fullName}`,
    `Pasport: ${orLine(c.passport)}`,
    `Manzil: ${orLine(c.address)}`,
    `Tel: ${c.phone ? formatPhone(c.phone) : LINE}`,
    'Imzo: ___________________',
    `Sana: ${day}`,
  ];
  return [
    heading(T.SECTION_11_TITLE),
    grid(
      [
        [
          { text: 'IJROCHI', bold: true },
          { text: 'BUYURTMACHI', bold: true },
        ],
        [{ stack: executor.map(line) }, { stack: customer.map(line) }],
      ],
      ['*', '*'],
    ),
    {
      text: T.LICENSE_LINE.join('   ·   '),
      fontSize: 8,
      color: '#555555',
      margin: [0, 4, 0, 0],
    },
  ];
}

function marketing(year: string): Content[] {
  const choice = '□ roziman    □ rozi emasman';
  return [
    heading(T.MARKETING_TITLE),
    grid([
      ...T.MARKETING_ROWS.map((label) => row(label, choice)),
      row(
        T.MARKETING_SIGN_LABEL,
        `Imzo: ____________________    Sana: ${blankDate(year)}`,
      ),
    ]),
    { text: T.MARKETING_NOTE, fontSize: 8, italics: true, margin: [0, 2, 0, 0] },
  ];
}

export function contractDocDefinition(
  input: ContractPdfInput,
): TDocumentDefinitions {
  if (input.templateVersion !== CONTRACT_TEMPLATE_VERSION) {
    throw new Error(
      `Shartnoma matnining ${input.templateVersion}-versiyasi yo'q`,
    );
  }
  const f = input.fields;
  const year = input.contractDate.slice(0, 4);
  return {
    info: { title: `Shartnoma ${input.number}`, author: T.COMPANY_NAME },
    pageSize: 'A4',
    // Same margins as the Word file: left 23 mm, right 15.6 mm.
    pageMargins: [23 * MM, 15 * MM, 15.6 * MM, 18 * MM],
    defaultStyle: { font: 'Inter', fontSize: 9, lineHeight: 1.25, color: '#111111' },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${input.number} · ${currentPage} / ${pageCount}`,
      alignment: 'right',
      fontSize: 7.5,
      color: '#777777',
      margin: [0, 8, 15.6 * MM, 0],
    }),
    background: input.cancelled
      ? (_page: number, size: { width: number; height: number }) => ({
          text: 'BEKOR QILINGAN',
          color: '#DC2626',
          opacity: 0.12,
          bold: true,
          fontSize: 72,
          absolutePosition: { x: 0, y: size.height / 2 - 50 },
          alignment: 'center',
        })
      : undefined,
    content: [
      { text: T.TITLE, bold: true, fontSize: 12, alignment: 'center' },
      {
        text: `№ ${input.number}`,
        bold: true,
        alignment: 'center',
        margin: [0, 2, 0, 6],
      },
      {
        columns: [
          { text: `${f.branch.city} shahri` },
          { text: headerDate(input.contractDate), alignment: 'right' },
        ],
        margin: [0, 0, 0, 8],
      },
      paragraph(T.PREAMBLE),
      { text: T.MINOR_NOTE, italics: true, fontSize: 8, margin: [0, 0, 0, 4] },
      ...parties(f),
      ...subject(f, year),
      ...body(),
      ...requisites(f, input.contractDate),
      ...marketing(year),
    ],
  };
}

export function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  return renderPdf(contractDocDefinition(input));
}
```

- [ ] **Step 4: Run** → PASS. If `tsc` complains about a pdfmake type, give the offending helper an explicit `Content` / `TableCell` return type (that is what makes margin tuples typecheck); do not cast to `any`.

- [ ] **Step 5: Look at the PDF once** — temporarily add these two lines at the end of the "renders a real PDF" test:

```ts
    const out = require('path').join(require('os').tmpdir(), 'contract-preview.pdf');
    require('fs').writeFileSync(out, buf); console.log(out);
```

Run the spec, open the printed path with the Read tool (`pages: "1-5"`), and check: the title and the «Namangan shahri | «10» oktabr 2026 yil» line, tables fit the page width, no text is cut, the page number shows in the footer, 2 – 5 pages in all. Then delete the two lines and run the spec again.

- [ ] **Step 6: Format, lint, typecheck, commit**

```bash
npx prettier --write src/contract-documents/pdf/contract-pdf.ts src/contract-documents/pdf/contract-pdf.spec.ts
npx eslint src/contract-documents/pdf/contract-pdf.ts src/contract-documents/pdf/contract-pdf.spec.ts
npm run typecheck
cd .. && git add server/src/contract-documents/pdf
git commit -m "feat(contract): contract PDF built from the sealed fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: DTOs and the API view

**Files:**
- Create: `server/src/contract-documents/dto/contract-document.dto.ts`, `server/src/contract-documents/contract-view.ts`
- Test: `server/src/contract-documents/dto/contract-document.dto.spec.ts`, `server/src/contract-documents/contract-view.spec.ts`

**Interfaces:**
- Produces DTO classes: `StudentContractsQueryDto { studentId: number }`, `ContractCustomerDto`, `ContractCourseExtrasDto`, `CreateContractDocumentDto { studentId; enrollmentIds: string[]; studentBirthDate?; customer: ContractCustomerDto; courses?: ContractCourseExtrasDto[] }`, `UpdateContractDocumentDto { customer?; courses? }`, `CancelContractDocumentDto { reason: string }`.
- Produces view: `CONTRACT_VIEW_INCLUDE`, `type ContractWithView`, `type ContractStatusView = 'UNSIGNED' | 'SIGNED' | 'CANCELLED'`, `contractStatus(doc)`, `interface ContractView`, `toContractView(doc: ContractWithView): ContractView`, `interface ContractPrefill`, `interface ContractsList`.

- [ ] **Step 1: Write the failing tests**

`dto/contract-document.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CancelContractDocumentDto,
  CreateContractDocumentDto,
} from './contract-document.dto';

const ENR = '11111111-1111-4111-8111-111111111111';

async function errors<T extends object>(cls: new () => T, body: object) {
  const dto = plainToInstance(cls, body);
  const found = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return found.map((e) => e.property);
}

const valid = {
  studentId: 10001,
  enrollmentIds: [ENR],
  customer: { kind: 'PARENT', fullName: 'Soliyeva Malika', phone: '901234567' },
  courses: [
    { enrollmentId: ENR, firstPaymentAmount: 405000, includes: ['DARSLIK'] },
  ],
};

describe('CreateContractDocumentDto', () => {
  it('accepts what the dialog sends', async () => {
    expect(await errors(CreateContractDocumentDto, valid)).toEqual([]);
  });

  it('needs at least one course', async () => {
    expect(
      await errors(CreateContractDocumentDto, { ...valid, enrollmentIds: [] }),
    ).toEqual(['enrollmentIds']);
  });

  it('checks the nested customer and course extras', async () => {
    expect(
      await errors(CreateContractDocumentDto, {
        ...valid,
        customer: { kind: 'FRIEND', fullName: ' ' },
        courses: [{ enrollmentId: ENR, includes: ['KITOB'] }],
      }),
    ).toEqual(['customer', 'courses']);
  });

  it('refuses unknown fields', async () => {
    expect(
      await errors(CreateContractDocumentDto, { ...valid, number: 'X' }),
    ).toEqual(['number']);
  });
});

describe('CancelContractDocumentDto', () => {
  it('needs a reason of at least 3 letters after trimming', async () => {
    expect(await errors(CancelContractDocumentDto, { reason: '  ab ' })).toEqual([
      'reason',
    ]);
    expect(await errors(CancelContractDocumentDto, { reason: 'Xato tuzildi' })).toEqual([]);
  });
});
```

`contract-view.spec.ts`:

```ts
import { contractStatus, toContractView, type ContractWithView } from './contract-view';

const row = (over: Partial<ContractWithView> = {}): ContractWithView =>
  ({
    id: 'doc-1',
    companyId: 1,
    number: 'DAF-2026-00001',
    studentId: 10001,
    branchId: 1,
    templateVersion: 1,
    contractDate: new Date('2026-10-10T00:00:00Z'),
    fields: { courses: [] },
    createdById: 7,
    createdAt: new Date('2026-10-10T06:00:00Z'),
    updatedAt: new Date('2026-10-10T06:00:00Z'),
    signedAt: null,
    signedById: null,
    signMethod: null,
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    createdBy: { firstName: 'Ali', lastName: 'Valiyev' },
    signedBy: null,
    cancelledBy: null,
    enrollments: [{ id: 'e-1', status: 'ACTIVE', group: { name: '#032' } }],
    ...over,
  }) as ContractWithView;

describe('contract view', () => {
  it('derives the status from the two stamps', () => {
    expect(contractStatus({ signedAt: null, cancelledAt: null })).toBe('UNSIGNED');
    expect(contractStatus({ signedAt: new Date(), cancelledAt: null })).toBe('SIGNED');
    expect(contractStatus({ signedAt: new Date(), cancelledAt: new Date() })).toBe('CANCELLED');
  });

  it('maps the row for the profile tab', () => {
    expect(toContractView(row())).toMatchObject({
      id: 'doc-1',
      number: 'DAF-2026-00001',
      contractDate: '2026-10-10',
      status: 'UNSIGNED',
      createdBy: 'Valiyev Ali',
      signedBy: null,
      links: [{ enrollmentId: 'e-1', status: 'ACTIVE', groupName: '#032' }],
    });
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/contract-documents/dto src/contract-documents/contract-view.spec.ts` → FAIL.

- [ ] **Step 3: Implement the DTOs** — `dto/contract-document.dto.ts`:

```ts
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CONTRACT_INCLUDES,
  CUSTOMER_KINDS,
  type ContractInclude,
  type CustomerKind,
} from '../contract-fields';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak";
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** `GET /contract-documents?studentId=` and `GET /contract-documents/prefill`. */
export class StudentContractsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  studentId: number;
}

export class ContractCustomerDto {
  @IsIn(CUSTOMER_KINDS)
  kind: CustomerKind;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  kindOther?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Buyurtmachining F.I.O. sini kiriting" })
  @MaxLength(150)
  fullName: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  birthDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  passport?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @Matches(/^\d{9}$/, {
    message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  telegram?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: "E-mail noto'g'ri" })
  @MaxLength(120)
  email?: string;
}

export class ContractCourseExtrasDto {
  @IsUUID('all')
  enrollmentId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  firstPaymentAmount?: number;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  firstPaymentDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  discountReason?: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  discountFrom?: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  discountTo?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONTRACT_INCLUDES.length)
  @IsIn(CONTRACT_INCLUDES, { each: true })
  includes?: ContractInclude[];
}

export class CreateContractDocumentDto {
  @IsInt()
  @Min(1)
  studentId: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta kursni tanlang' })
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  enrollmentIds: string[];

  /** Only when the profile has none; written to the profile (never overwrites). */
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  studentBirthDate?: string;

  @ValidateNested()
  @Type(() => ContractCustomerDto)
  customer: ContractCustomerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractCourseExtrasDto)
  courses?: ContractCourseExtrasDto[];
}

/** Only the parts that stay editable until signing; a course's extras are replaced whole. */
export class UpdateContractDocumentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ContractCustomerDto)
  customer?: ContractCustomerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractCourseExtrasDto)
  courses?: ContractCourseExtrasDto[];
}

export class CancelContractDocumentDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Bekor qilish sababini yozing' })
  @MaxLength(500)
  reason: string;
}
```

- [ ] **Step 4: Implement the view** — `contract-view.ts`:

```ts
import type { EnrollmentStatus, Prisma } from '@prisma/client';
import { tashkentDateStr } from '../common/date/tashkent';
import type { ContractCustomer, ContractFields } from './contract-fields';

const USER_NAME = { select: { firstName: true, lastName: true } } as const;

export const CONTRACT_VIEW_INCLUDE = {
  createdBy: USER_NAME,
  signedBy: USER_NAME,
  cancelledBy: USER_NAME,
  enrollments: {
    where: { deletedAt: null },
    select: { id: true, status: true, group: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  },
} as const satisfies Prisma.ContractDocumentInclude;

export type ContractWithView = Prisma.ContractDocumentGetPayload<{
  include: typeof CONTRACT_VIEW_INCLUDE;
}>;

export type ContractStatusView = 'UNSIGNED' | 'SIGNED' | 'CANCELLED';

export interface ContractView {
  id: string;
  number: string;
  contractDate: string;
  templateVersion: number;
  status: ContractStatusView;
  createdAt: string;
  createdBy: string | null;
  signedAt: string | null;
  signedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  fields: ContractFields;
  /** Enrollments linked now — a transfer adds the new group's here. */
  links: { enrollmentId: string; status: EnrollmentStatus; groupName: string }[];
}

export interface ContractsList {
  contracts: ContractView[];
  /** ACTIVE/FROZEN monthly courses under no live contract. */
  uncovered: {
    enrollmentId: string;
    status: EnrollmentStatus;
    courseName: string;
    groupName: string;
  }[];
}

export interface ContractPrefill {
  today: string;
  branch: { name: string; missing: string[] };
  student: {
    fullName: string;
    birthDate: string | null;
    isMinor: boolean | null;
    phone: string;
    telegram: string | null;
    passport: string | null;
    address: string | null;
    parentName: string | null;
    parentPhone: string | null;
  };
  lastCustomer: ContractCustomer | null;
  courses: {
    enrollmentId: string;
    status: EnrollmentStatus;
    courseName: string;
    groupName: string;
    contractNumber: string | null;
    monthlyPrice: number;
    discountPercent: number;
    firstPaymentAmount: number;
  }[];
}

const nameOf = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.lastName} ${u.firstName}`.trim() : null;

export function contractStatus(doc: {
  signedAt: Date | null;
  cancelledAt: Date | null;
}): ContractStatusView {
  if (doc.cancelledAt) return 'CANCELLED';
  return doc.signedAt ? 'SIGNED' : 'UNSIGNED';
}

export function toContractView(doc: ContractWithView): ContractView {
  return {
    id: doc.id,
    number: doc.number,
    contractDate: tashkentDateStr(doc.contractDate),
    templateVersion: doc.templateVersion,
    status: contractStatus(doc),
    createdAt: doc.createdAt.toISOString(),
    createdBy: nameOf(doc.createdBy),
    signedAt: doc.signedAt?.toISOString() ?? null,
    signedBy: nameOf(doc.signedBy),
    cancelledAt: doc.cancelledAt?.toISOString() ?? null,
    cancelledBy: nameOf(doc.cancelledBy),
    cancelReason: doc.cancelReason,
    fields: doc.fields as unknown as ContractFields,
    links: doc.enrollments.map((e) => ({
      enrollmentId: e.id,
      status: e.status,
      groupName: e.group.name,
    })),
  };
}
```

- [ ] **Step 5: Run** → PASS. Then `npm run typecheck` (the `as const satisfies` include must type-check against the generated client).

- [ ] **Step 6: Format, lint, commit**

```bash
npx prettier --write src/contract-documents/dto src/contract-documents/contract-view.ts src/contract-documents/contract-view.spec.ts
npx eslint src/contract-documents/dto src/contract-documents/contract-view.ts src/contract-documents/contract-view.spec.ts
cd .. && git add server/src/contract-documents
git commit -m "feat(contract): request DTOs and the contract API view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Service — list, prefill, create

**Files:**
- Create: `server/src/contract-documents/contract-documents.service.ts`
- Test: `server/src/contract-documents/contract-documents.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 4, 5, 7, 8; `assertCallerMayTouchStudent`, `birthDateProblem`, `EntityHistoryService`, `rethrowAsConflict`.
- Produces: `ContractDocumentsService` with `list(studentId, companyId, userId): Promise<ContractsList>`, `prefill(studentId, companyId, userId): Promise<ContractPrefill>`, `create(dto, companyId, userId): Promise<ContractView>`; exported `uncoveredWhere(studentId)`. Task 10 adds `update`, `sign`, `cancel`, `pdf` to the same class.

- [ ] **Step 1: Write the failing test** — `contract-documents.service.spec.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { ContractDocumentsService } from './contract-documents.service';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn().mockResolvedValue(1),
}));
jest.mock('./pdf/contract-pdf', () => ({
  renderContractPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.3')),
}));

const ENR = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-10T06:00:00Z');

const STUDENT = {
  id: 10001,
  firstName: 'Ahror',
  lastName: 'Soliyev',
  dateOfBirth: new Date('1995-05-05T00:00:00Z'),
  deletedAt: null,
  discountPercent: 10,
  phone: '901234567',
  telegram: '@ahror',
  passportSeries: null,
  address: 'Namangan',
  parentName: 'Soliyeva Malika',
  parentPhone: '907654321',
};

const BRANCH = {
  name: 'Namangan filiali',
  city: 'Namangan',
  address: "Istiqlol ko'chasi, 48",
  representativeName: 'Karimov Anvar',
  representativePosition: 'Direktor',
};

const enrollmentRow = (over: Record<string, unknown> = {}) => ({
  id: ENR,
  status: 'ACTIVE',
  startDate: new Date('2026-09-01T00:00:00Z'),
  createdAt: new Date('2026-09-01T00:00:00Z'),
  contractDocument: null,
  group: {
    name: '#032',
    level: 'A1',
    exactDays: ['monday', 'wednesday', 'friday'],
    lessonStartTime: '14:00',
    lessonEndTime: '15:30',
    lessonMinutes: 90,
    course: {
      name: 'Standart',
      price: 450_000,
      lessonMinutes: null,
      paymentModel: 'MONTHLY',
    },
    teachers: [{ teacher: { firstName: 'Aziza', lastName: 'Karimova' } }],
  },
  ...over,
});

const viewRow = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  companyId: 1,
  number: 'DAF-2026-00001',
  studentId: 10001,
  branchId: 1,
  templateVersion: 1,
  contractDate: new Date('2026-10-10T00:00:00Z'),
  fields: { customer: { kind: 'SELF', fullName: 'Soliyev Ahror' }, courses: [] },
  createdById: 99,
  createdAt: NOW,
  updatedAt: NOW,
  signedAt: null,
  signedById: null,
  signMethod: null,
  cancelledAt: null,
  cancelledById: null,
  cancelReason: null,
  createdBy: { firstName: 'Ali', lastName: 'Valiyev' },
  signedBy: null,
  cancelledBy: null,
  enrollments: [{ id: ENR, status: 'ACTIVE', group: { name: '#032' } }],
  ...over,
});

function makePrisma() {
  const prisma = {
    student: {
      findFirst: jest.fn().mockResolvedValue(STUDENT),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    branch: { findFirst: jest.fn().mockResolvedValue(BRANCH) },
    enrollment: {
      findMany: jest.fn().mockResolvedValue([enrollmentRow()]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    contractDocument: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(viewRow()),
      create: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (fn: (tx: unknown) => unknown) => fn(prisma),
  );
  return prisma;
}

const history = () => ({
  recordCreate: jest.fn(),
  recordUpdate: jest.fn(),
  recordDelete: jest.fn(),
  recordStatusChange: jest.fn(),
  recordRestore: jest.fn(),
});

const dto = (over: Record<string, unknown> = {}) =>
  ({
    studentId: 10001,
    enrollmentIds: [ENR],
    customer: { kind: 'SELF', fullName: 'Soliyev Ahror', passport: 'AB1234567' },
    courses: [{ enrollmentId: ENR, includes: ['DARSLIK'] }],
    ...over,
  }) as never;

describe('ContractDocumentsService — create', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let hist: ReturnType<typeof history>;
  let service: ContractDocumentsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = makePrisma();
    hist = history();
    service = new ContractDocumentsService(prisma as never, hist as never);
  });
  afterEach(() => jest.useRealTimers());

  it('seals the fields, numbers the contract and links the courses', async () => {
    const view = await service.create(dto(), 1, 99);

    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith(prisma, 99, 10001, 1);
    expect(prisma.contractDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 1,
        number: 'DAF-2026-00001',
        studentId: 10001,
        branchId: 1,
        templateVersion: 1,
        createdById: 99,
        fields: expect.objectContaining({
          branch: expect.objectContaining({ city: 'Namangan' }),
          student: { fullName: 'Soliyev Ahror', birthDate: '1995-05-05', isMinor: false },
          customer: expect.objectContaining({ kind: 'SELF', passport: 'AB1234567' }),
          courses: [
            expect.objectContaining({
              courseName: 'Standart',
              lessonsPerWeek: 3,
              firstPaymentAmount: 405_000,
              includes: ['DARSLIK'],
            }),
          ],
        }),
      }),
    });
    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ENR] }, contractDocumentId: null },
      data: { contractDocumentId: 'doc-1' },
    });
    expect(hist.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 10001,
        newValues: expect.objectContaining({
          action: 'SHARTNOMA_TUZILDI',
          raqam: 'DAF-2026-00001',
          kurslar: 'Standart (#032)',
        }),
      }),
    );
    expect(view.number).toBe('DAF-2026-00001');
  });

  it('continues the year sequence', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue({ number: 'DAF-2026-00041' });
    await service.create(dto(), 1, 99);
    expect(prisma.contractDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ number: 'DAF-2026-00042' }),
    });
  });

  it('asks for the birth date when the profile has none, then writes it', async () => {
    prisma.student.findFirst.mockResolvedValue({ ...STUDENT, dateOfBirth: null });
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(BadRequestException);

    await service.create(dto({ studentBirthDate: '2001-02-03' }), 1, 99);
    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 10001, dateOfBirth: null },
      data: { dateOfBirth: new Date('2001-02-03T00:00:00.000Z') },
    });
    expect(hist.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { dateOfBirth: null },
        newValues: { dateOfBirth: '2001-02-03' },
      }),
    );
  });

  it('refuses a minor as their own customer', async () => {
    prisma.student.findFirst.mockResolvedValue({
      ...STUDENT,
      dateOfBirth: new Date('2012-01-01T00:00:00Z'),
    });
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(/Voyaga yetmagan/);
  });

  it('refuses while the branch settings are incomplete', async () => {
    prisma.branch.findFirst.mockResolvedValue({ ...BRANCH, city: null, representativeName: ' ' });
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(
      /shahar, vakil ismi/,
    );
  });

  it('refuses a course already under a contract', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      enrollmentRow({ contractDocument: { number: 'DAF-2026-00012' } }),
    ]);
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(ConflictException);
  });

  it('refuses a 12-lesson pack course', async () => {
    const pack = enrollmentRow();
    (pack.group as { course: { paymentModel: string } }).course.paymentModel = 'LESSON_PACK';
    prisma.enrollment.findMany.mockResolvedValue([pack]);
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(BadRequestException);
  });

  it('turns a link lost to a concurrent contract into 409', async () => {
    prisma.enrollment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(ConflictException);
  });

  it('refuses extras for a course that is not selected', async () => {
    await expect(
      service.create(
        dto({ courses: [{ enrollmentId: '22222222-2222-4222-8222-222222222222' }] }),
        1,
        99,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an impossible calendar day', async () => {
    await expect(
      service.create(
        dto({ customer: { kind: 'PARENT', fullName: 'X', birthDate: '2026-02-30' } }),
        1,
        99,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ContractDocumentsService — reads', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ContractDocumentsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = makePrisma();
    service = new ContractDocumentsService(prisma as never, history() as never);
  });
  afterEach(() => jest.useRealTimers());

  it('lists contracts and the courses still without one', async () => {
    prisma.contractDocument.findMany.mockResolvedValue([viewRow()]);
    prisma.enrollment.findMany.mockResolvedValue([
      { id: 'e-2', status: 'FROZEN', group: { name: '#041', course: { name: 'Intensive' } } },
    ]);
    const out = await service.list(10001, 1, 99);
    expect(out.contracts[0]).toMatchObject({ number: 'DAF-2026-00001', status: 'UNSIGNED' });
    expect(out.uncovered).toEqual([
      { enrollmentId: 'e-2', status: 'FROZEN', courseName: 'Intensive', groupName: '#041' },
    ]);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: 10001,
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
          contractDocumentId: null,
          group: { course: { paymentModel: 'MONTHLY' } },
        },
      }),
    );
  });

  it('prefills from the profile and the last contract', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue({
      fields: { customer: { kind: 'SELF', passport: 'AB1234567' } },
    });
    prisma.branch.findFirst.mockResolvedValue({ ...BRANCH, address: null });
    const out = await service.prefill(10001, 1, 99);
    expect(out.today).toBe('2026-10-10');
    expect(out.branch.missing).toEqual(['manzil']);
    expect(out.student).toMatchObject({ birthDate: '1995-05-05', isMinor: false });
    expect(out.lastCustomer).toMatchObject({ passport: 'AB1234567' });
    expect(out.courses[0]).toMatchObject({
      enrollmentId: ENR,
      contractNumber: null,
      firstPaymentAmount: 405_000,
    });
  });

  it('throws NotFound when the student is gone', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(service.prefill(10001, 1, 99)).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run it** — `npx jest src/contract-documents/contract-documents.service.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `contract-documents.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { applyDiscount, clampDiscount } from '../billing/monthly-price';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import {
  isCalendarDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { EntityHistoryService } from '../common/entity-history';
import {
  CONCURRENT_CHANGE_MESSAGE,
  rethrowAsConflict,
} from '../common/transaction-conflict';
import { PrismaService } from '../prisma/prisma.service';
import { birthDateProblem } from '../students/shared/student-onboarding';
import {
  CONTRACT_TEMPLATE_VERSION,
  buildCourseFields,
  buildCustomer,
  courseList,
  customerProblem,
  isMinorOn,
  missingBranchFields,
  personName,
  storedBirthDay,
  type ContractCourseExtras,
  type ContractFields,
} from './contract-fields';
import { nextContractNumber } from './contract-number';
import {
  CONTRACT_VIEW_INCLUDE,
  toContractView,
  type ContractPrefill,
  type ContractView,
  type ContractsList,
} from './contract-view';
import type {
  ContractCourseExtrasDto,
  CreateContractDocumentDto,
} from './dto/contract-document.dto';

type Db = PrismaService | Prisma.TransactionClient;

const LIVE_STATUSES = ['ACTIVE', 'FROZEN'] as const;

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

const STUDENT_FOR_CONTRACT = {
  id: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  deletedAt: true,
  discountPercent: true,
  phone: true,
  telegram: true,
  passportSeries: true,
  address: true,
  parentName: true,
  parentPhone: true,
} as const satisfies Prisma.StudentSelect;

const BRANCH_FOR_CONTRACT = {
  name: true,
  city: true,
  address: true,
  representativeName: true,
  representativePosition: true,
} as const satisfies Prisma.BranchSelect;

const ENROLLMENT_FOR_CONTRACT = {
  id: true,
  status: true,
  startDate: true,
  createdAt: true,
  contractDocument: { select: { number: true } },
  group: {
    select: {
      name: true,
      level: true,
      exactDays: true,
      lessonStartTime: true,
      lessonEndTime: true,
      lessonMinutes: true,
      course: {
        select: {
          name: true,
          price: true,
          lessonMinutes: true,
          paymentModel: true,
        },
      },
      teachers: {
        select: { teacher: { select: { firstName: true, lastName: true } } },
      },
    },
  },
} as const satisfies Prisma.EnrollmentSelect;

/** A course still without a contract: live monthly enrollment, no live link. */
export function uncoveredWhere(studentId: number): Prisma.EnrollmentWhereInput {
  return {
    studentId,
    deletedAt: null,
    status: { in: [...LIVE_STATUSES] },
    contractDocumentId: null,
    group: { course: { paymentModel: 'MONTHLY' } },
  };
}

function assertDay(value: string | undefined): void {
  if (value !== undefined && !isCalendarDateStr(value)) {
    throw new BadRequestException(`Sana noto'g'ri: ${value}`);
  }
}

export function assertCourseExtras(
  courses: ContractCourseExtrasDto[] | undefined,
): void {
  for (const c of courses ?? []) {
    assertDay(c.firstPaymentDate);
    assertDay(c.discountFrom);
    assertDay(c.discountTo);
    if (c.discountFrom && c.discountTo && c.discountFrom > c.discountTo) {
      throw new BadRequestException(
        "Chegirma muddatining oxiri boshidan oldin bo'lishi mumkin emas",
      );
    }
  }
}

export function extrasOf(
  dto: ContractCourseExtrasDto | undefined,
): Partial<ContractCourseExtras> {
  if (!dto) return {};
  return {
    firstPaymentAmount: dto.firstPaymentAmount,
    firstPaymentDate: dto.firstPaymentDate,
    discountReason: dto.discountReason,
    discountFrom: dto.discountFrom,
    discountTo: dto.discountTo,
    includes: dto.includes,
  };
}

@Injectable()
export class ContractDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: EntityHistoryService,
  ) {}

  async list(
    studentId: number,
    companyId: number,
    userId: number,
  ): Promise<ContractsList> {
    await assertCallerMayTouchStudent(this.prisma, userId, studentId, companyId);
    const [docs, uncovered] = await Promise.all([
      this.prisma.contractDocument.findMany({
        where: { studentId, companyId },
        orderBy: { createdAt: 'desc' },
        include: CONTRACT_VIEW_INCLUDE,
      }),
      this.prisma.enrollment.findMany({
        where: uncoveredWhere(studentId),
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          group: { select: { name: true, course: { select: { name: true } } } },
        },
      }),
    ]);
    return {
      contracts: docs.map(toContractView),
      uncovered: uncovered.map((e) => ({
        enrollmentId: e.id,
        status: e.status,
        courseName: e.group.course.name,
        groupName: e.group.name,
      })),
    };
  }

  async prefill(
    studentId: number,
    companyId: number,
    userId: number,
  ): Promise<ContractPrefill> {
    const branchId = await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const [student, branch, last, enrollments] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: studentId, companyId },
        select: STUDENT_FOR_CONTRACT,
      }),
      this.prisma.branch.findFirst({
        where: { id: branchId, companyId },
        select: BRANCH_FOR_CONTRACT,
      }),
      this.prisma.contractDocument.findFirst({
        where: { studentId, companyId },
        orderBy: { createdAt: 'desc' },
        select: { fields: true },
      }),
      this.prisma.enrollment.findMany({
        where: {
          studentId,
          deletedAt: null,
          status: { in: [...LIVE_STATUSES] },
          group: { course: { paymentModel: 'MONTHLY' } },
        },
        orderBy: { createdAt: 'asc' },
        select: ENROLLMENT_FOR_CONTRACT,
      }),
    ]);
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    if (!branch) throw new NotFoundException('Filial topilmadi');

    const today = tashkentDateStr(new Date());
    const birthDate = student.dateOfBirth
      ? storedBirthDay(student.dateOfBirth)
      : null;
    const discount = clampDiscount(student.discountPercent);
    return {
      today,
      branch: { name: branch.name, missing: missingBranchFields(branch) },
      student: {
        fullName: personName(student),
        birthDate,
        isMinor: birthDate ? isMinorOn(birthDate, today) : null,
        phone: student.phone,
        telegram: student.telegram,
        passport: student.passportSeries,
        address: student.address,
        parentName: student.parentName,
        parentPhone: student.parentPhone,
      },
      lastCustomer: last
        ? (last.fields as unknown as ContractFields).customer
        : null,
      courses: enrollments.map((e) => ({
        enrollmentId: e.id,
        status: e.status,
        courseName: e.group.course.name,
        groupName: e.group.name,
        contractNumber: e.contractDocument?.number ?? null,
        monthlyPrice: e.group.course.price,
        discountPercent: discount,
        firstPaymentAmount: applyDiscount(e.group.course.price, discount),
      })),
    };
  }

  async create(
    dto: CreateContractDocumentDto,
    companyId: number,
    userId: number,
  ): Promise<ContractView> {
    const branchId = await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      dto.studentId,
      companyId,
    );
    const ids = [...new Set(dto.enrollmentIds)];
    if (ids.length !== dto.enrollmentIds.length) {
      throw new BadRequestException('Bitta kurs ikki marta tanlangan');
    }
    const extrasById = new Map(
      (dto.courses ?? []).map((c) => [c.enrollmentId, c]),
    );
    if ([...extrasById.keys()].some((id) => !ids.includes(id))) {
      throw new BadRequestException(
        "Tanlanmagan kurs uchun ma'lumot yuborilgan",
      );
    }
    assertDay(dto.customer.birthDate);
    assertCourseExtras(dto.courses);
    const contractDate = tashkentDateStr(new Date());

    return this.prisma
      .$transaction(async (tx) => {
        const student = await tx.student.findFirst({
          where: { id: dto.studentId, companyId },
          select: STUDENT_FOR_CONTRACT,
        });
        if (!student || student.deletedAt) {
          throw new BadRequestException(
            "Arxivdagi o'quvchiga shartnoma tuzilmaydi",
          );
        }
        const birthDate = await this.ensureBirthDate(
          tx,
          student,
          dto.studentBirthDate,
          contractDate,
          companyId,
          userId,
        );
        const isMinor = isMinorOn(birthDate, contractDate);
        const problem = customerProblem(
          dto.customer.kind,
          dto.customer.kindOther,
          isMinor,
        );
        if (problem) throw new BadRequestException(problem);

        const branch = await tx.branch.findFirst({
          where: { id: branchId, companyId },
          select: BRANCH_FOR_CONTRACT,
        });
        if (!branch) throw new NotFoundException('Filial topilmadi');
        const missing = missingBranchFields(branch);
        if (missing.length > 0) {
          throw new BadRequestException(
            `Filial sozlamasida ${missing.join(', ')} kiritilmagan — shartnoma tuzishdan oldin to'ldiring`,
          );
        }

        const enrollments = await tx.enrollment.findMany({
          where: { id: { in: ids }, studentId: student.id, deletedAt: null },
          select: ENROLLMENT_FOR_CONTRACT,
        });
        if (enrollments.length !== ids.length) {
          throw new BadRequestException(
            "Kurs topilmadi yoki bu o'quvchiga tegishli emas",
          );
        }
        for (const e of enrollments) {
          if (e.status !== 'ACTIVE' && e.status !== 'FROZEN') {
            throw new BadRequestException(
              `${e.group.name} guruhidagi kurs faol emas`,
            );
          }
          if (e.group.course.paymentModel !== 'MONTHLY') {
            throw new BadRequestException(
              `${e.group.name}: 12 talik kurs uchun shartnoma hali yo'q`,
            );
          }
          if (e.contractDocument) {
            throw new ConflictException(
              `${e.group.name} guruhidagi kurs № ${e.contractDocument.number} shartnomada bor`,
            );
          }
        }

        const studentFields = {
          fullName: personName(student),
          birthDate,
          isMinor,
        };
        const fields: ContractFields = {
          branch: {
            name: branch.name,
            city: branch.city!.trim(),
            address: branch.address!.trim(),
            representativeName: branch.representativeName!.trim(),
            representativePosition: branch.representativePosition!.trim(),
          },
          student: studentFields,
          customer: buildCustomer(dto.customer, studentFields),
          courses: ids.map((id) =>
            buildCourseFields(
              enrollments.find((e) => e.id === id)!,
              student.discountPercent,
              extrasOf(extrasById.get(id)),
            ),
          ),
        };

        const number = await nextContractNumber(
          tx,
          companyId,
          contractDate.slice(0, 4),
        );
        const doc = await tx.contractDocument.create({
          data: {
            companyId,
            number,
            studentId: student.id,
            branchId,
            templateVersion: CONTRACT_TEMPLATE_VERSION,
            contractDate: utcMidnightFromDateStr(contractDate),
            fields: fields as unknown as Prisma.InputJsonValue,
            createdById: userId,
          },
        });
        const linked = await tx.enrollment.updateMany({
          where: { id: { in: ids }, contractDocumentId: null },
          data: { contractDocumentId: doc.id },
        });
        if (linked.count !== ids.length) {
          throw new ConflictException(CONCURRENT_CHANGE_MESSAGE);
        }
        await this.history.recordCreate({
          entityType: 'Student',
          entityId: student.id,
          newValues: {
            action: 'SHARTNOMA_TUZILDI',
            raqam: number,
            kurslar: courseList(fields.courses),
          },
          changedById: userId,
          companyId,
          tx,
        });
        return this.loadView(tx, doc.id);
      }, SERIALIZABLE)
      .catch((err: unknown) => rethrowAsConflict(err, { duplicate: true }));
  }

  /** The profile's birth date, or the one typed now — written only if empty (ADR-0039). */
  private async ensureBirthDate(
    tx: Prisma.TransactionClient,
    student: { id: number; dateOfBirth: Date | null },
    typed: string | undefined,
    today: string,
    companyId: number,
    userId: number,
  ): Promise<string> {
    if (student.dateOfBirth) return storedBirthDay(student.dateOfBirth);
    if (!typed) {
      throw new BadRequestException("O'quvchining tug'ilgan sanasini kiriting");
    }
    const problem = birthDateProblem(typed, today);
    if (problem) throw new BadRequestException(problem);
    await tx.student.updateMany({
      where: { id: student.id, dateOfBirth: null },
      data: { dateOfBirth: utcMidnightFromDateStr(typed) },
    });
    await this.history.recordUpdate({
      entityType: 'Student',
      entityId: student.id,
      oldValues: { dateOfBirth: null },
      newValues: { dateOfBirth: typed },
      changedById: userId,
      companyId,
      tx,
    });
    return typed;
  }

  protected async loadView(db: Db, id: string): Promise<ContractView> {
    const doc = await db.contractDocument.findUniqueOrThrow({
      where: { id },
      include: CONTRACT_VIEW_INCLUDE,
    });
    return toContractView(doc);
  }
}
```

- [ ] **Step 4: Run** → PASS. `npm run typecheck` → clean. The file stays well under 500 lines; Task 10 adds about 150 more.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/contract-documents/contract-documents.service.ts src/contract-documents/contract-documents.service.spec.ts
npx eslint src/contract-documents/contract-documents.service.ts src/contract-documents/contract-documents.service.spec.ts
cd .. && git add server/src/contract-documents
git commit -m "feat(contract): list, prefill and create contract documents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Service — update, sign, cancel, pdf

**Files:**
- Modify: `server/src/contract-documents/contract-documents.service.ts`
- Test: `server/src/contract-documents/contract-documents.service.spec.ts`

**Interfaces:**
- Produces: `update(id, dto: UpdateContractDocumentDto, companyId, userId): Promise<ContractView>`, `sign(id, companyId, userId): Promise<ContractView>`, `cancel(id, reason: string, companyId, userId): Promise<ContractView>`, `pdf(id, companyId, userId): Promise<{ buffer: Buffer; filename: string }>`.

- [ ] **Step 1: Write the failing tests** — append to the spec file:

```ts
describe('ContractDocumentsService — after creation', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let hist: ReturnType<typeof history>;
  let service: ContractDocumentsService;
  const sealed = {
    branch: BRANCH,
    student: { fullName: 'Soliyev Ahror', birthDate: '1995-05-05', isMinor: false },
    customer: {
      kind: 'SELF',
      kindOther: null,
      fullName: 'Soliyev Ahror',
      birthDate: '1995-05-05',
      passport: null,
      address: null,
      phone: null,
      telegram: null,
      email: null,
    },
    courses: [
      {
        enrollmentId: ENR,
        courseName: 'Standart',
        groupName: '#032',
        monthlyPrice: 450_000,
        discountPercent: 10,
        firstPaymentAmount: 405_000,
        firstPaymentDate: null,
        discountReason: null,
        discountFrom: null,
        discountTo: null,
        includes: [],
      },
    ],
  };
  const doc = (over: Record<string, unknown> = {}) => ({
    id: 'doc-1',
    companyId: 1,
    number: 'DAF-2026-00001',
    studentId: 10001,
    templateVersion: 1,
    contractDate: new Date('2026-10-10T00:00:00Z'),
    fields: sealed,
    signedAt: null,
    cancelledAt: null,
    ...over,
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = makePrisma();
    hist = history();
    service = new ContractDocumentsService(prisma as never, hist as never);
    prisma.contractDocument.findFirst.mockResolvedValue(doc());
  });
  afterEach(() => jest.useRealTimers());

  it('updates the customer and course extras of an unsigned contract', async () => {
    await service.update(
      'doc-1',
      {
        customer: { kind: 'SELF', fullName: 'x', passport: 'AB1234567' },
        courses: [{ enrollmentId: ENR, firstPaymentDate: '2026-10-12', includes: ['DARSLIK'] }],
      } as never,
      1,
      99,
    );
    const call = prisma.contractDocument.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'doc-1', signedAt: null, cancelledAt: null });
    expect(call.data.fields.customer.passport).toBe('AB1234567');
    expect(call.data.fields.courses[0]).toMatchObject({
      firstPaymentDate: '2026-10-12',
      firstPaymentAmount: 405_000,
      includes: ['DARSLIK'],
      courseName: 'Standart',
    });
    expect(hist.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({
          action: 'SHARTNOMA_TAHRIRLANDI',
          ozgardi: 'Buyurtmachi, Kurs: Standart',
        }),
      }),
    );
  });

  it('writes nothing when nothing changed', async () => {
    await service.update('doc-1', {} as never, 1, 99);
    expect(prisma.contractDocument.updateMany).not.toHaveBeenCalled();
  });

  it('locks a signed contract', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue(doc({ signedAt: NOW }));
    await expect(service.update('doc-1', {} as never, 1, 99)).rejects.toThrow(
      /Imzolangan/,
    );
  });

  it('marks paper signing once', async () => {
    await service.sign('doc-1', 1, 99);
    expect(prisma.contractDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', signedAt: null, cancelledAt: null },
      data: { signedAt: NOW, signedById: 99, signMethod: 'PAPER' },
    });
    prisma.contractDocument.findFirst.mockResolvedValue(doc({ signedAt: NOW }));
    await expect(service.sign('doc-1', 1, 99)).rejects.toThrow(/allaqachon/);
  });

  it('cancels an unsigned contract and frees its courses', async () => {
    await service.cancel('doc-1', 'Xato tuzildi', 1, 99);
    expect(prisma.contractDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', cancelledAt: null, signedAt: null },
      data: { cancelledAt: NOW, cancelledById: 99, cancelReason: 'Xato tuzildi' },
    });
    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { contractDocumentId: 'doc-1' },
      data: { contractDocumentId: null },
    });
  });

  it('lets only the CEO cancel a signed contract', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue(doc({ signedAt: NOW }));
    await expect(service.cancel('doc-1', 'Xato', 1, 99)).rejects.toThrow(
      /faqat CEO/,
    );
    prisma.user.findFirst.mockResolvedValue({ id: 99 });
    await service.cancel('doc-1', 'Xato', 1, 99);
    expect(prisma.contractDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', cancelledAt: null },
      data: { cancelledAt: NOW, cancelledById: 99, cancelReason: 'Xato' },
    });
  });

  it('builds the PDF from the sealed fields', async () => {
    const out = await service.pdf('doc-1', 1, 99);
    expect(out.filename).toBe('Shartnoma-DAF-2026-00001.pdf');
    expect(out.buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('answers 404 for another company contract', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue(null);
    await expect(service.sign('doc-x', 1, 99)).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run** → FAIL (`service.update is not a function`).

- [ ] **Step 3: Implement** — in `contract-documents.service.ts`:

Add to the imports: `ForbiddenException` (from `@nestjs/common`), `whereUserMayAct` (`'../common/auth/blocked-user'`), `withExtras` (from `./contract-fields`), `UpdateContractDocumentDto` (from the DTO file), and `renderContractPdf` (`'./pdf/contract-pdf'`).

Add these methods inside the class, before `ensureBirthDate`:

```ts
  async update(
    id: string,
    dto: UpdateContractDocumentDto,
    companyId: number,
    userId: number,
  ): Promise<ContractView> {
    const doc = await this.loadOwned(id, companyId, userId);
    if (doc.cancelledAt) {
      throw new BadRequestException("Bekor qilingan shartnoma o'zgarmaydi");
    }
    if (doc.signedAt) {
      throw new BadRequestException("Imzolangan shartnoma o'zgarmaydi");
    }
    const fields = doc.fields as unknown as ContractFields;
    const changed: string[] = [];
    let next = fields;

    if (dto.customer) {
      assertDay(dto.customer.birthDate);
      const problem = customerProblem(
        dto.customer.kind,
        dto.customer.kindOther,
        fields.student.isMinor,
      );
      if (problem) throw new BadRequestException(problem);
      const customer = buildCustomer(dto.customer, fields.student);
      if (JSON.stringify(customer) !== JSON.stringify(fields.customer)) {
        next = { ...next, customer };
        changed.push('Buyurtmachi');
      }
    }

    if (dto.courses) {
      assertCourseExtras(dto.courses);
      const byId = new Map(dto.courses.map((c) => [c.enrollmentId, c]));
      if (
        [...byId.keys()].some(
          (key) => !fields.courses.some((c) => c.enrollmentId === key),
        )
      ) {
        throw new BadRequestException("Bu shartnomada bunday kurs yo'q");
      }
      next = {
        ...next,
        courses: next.courses.map((course) => {
          const input = byId.get(course.enrollmentId);
          if (!input) return course;
          const updated = {
            ...course,
            ...withExtras(
              extrasOf(input),
              applyDiscount(course.monthlyPrice, course.discountPercent),
            ),
          };
          if (JSON.stringify(updated) !== JSON.stringify(course)) {
            changed.push(`Kurs: ${course.courseName}`);
          }
          return updated;
        }),
      };
    }

    if (changed.length === 0) return this.loadView(this.prisma, id);

    return this.prisma.$transaction(async (tx) => {
      const res = await tx.contractDocument.updateMany({
        where: { id, signedAt: null, cancelledAt: null },
        data: { fields: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count !== 1) throw new ConflictException(CONCURRENT_CHANGE_MESSAGE);
      await this.history.recordCreate({
        entityType: 'Student',
        entityId: doc.studentId,
        newValues: {
          action: 'SHARTNOMA_TAHRIRLANDI',
          raqam: doc.number,
          ozgardi: changed.join(', '),
        },
        changedById: userId,
        companyId,
        tx,
      });
      return this.loadView(tx, id);
    });
  }

  async sign(id: string, companyId: number, userId: number): Promise<ContractView> {
    const doc = await this.loadOwned(id, companyId, userId);
    if (doc.cancelledAt) {
      throw new BadRequestException('Bekor qilingan shartnoma imzolanmaydi');
    }
    if (doc.signedAt) {
      throw new BadRequestException('Shartnoma allaqachon imzolangan');
    }
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.contractDocument.updateMany({
        where: { id, signedAt: null, cancelledAt: null },
        data: { signedAt: new Date(), signedById: userId, signMethod: 'PAPER' },
      });
      if (res.count !== 1) throw new ConflictException(CONCURRENT_CHANGE_MESSAGE);
      await this.history.recordCreate({
        entityType: 'Student',
        entityId: doc.studentId,
        newValues: {
          action: 'SHARTNOMA_IMZOLANDI',
          raqam: doc.number,
          usul: "qog'ozda",
        },
        changedById: userId,
        companyId,
        tx,
      });
      return this.loadView(tx, id);
    });
  }

  /**
   * An unsigned contract: anyone who may open the student. A signed one: the
   * CEO only, read from the database (ADR-0028). The courses become
   * contract-less, so a new contract can be made for them.
   */
  async cancel(
    id: string,
    reason: string,
    companyId: number,
    userId: number,
  ): Promise<ContractView> {
    const doc = await this.loadOwned(id, companyId, userId);
    if (doc.cancelledAt) {
      throw new BadRequestException('Shartnoma allaqachon bekor qilingan');
    }
    if (doc.signedAt && !(await this.isCeo(userId))) {
      throw new ForbiddenException(
        'Imzolangan shartnomani faqat CEO bekor qila oladi',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.contractDocument.updateMany({
        // An unsigned read must still be unsigned at the write, or a
        // non-CEO would cancel a contract signed in between.
        where: doc.signedAt
          ? { id, cancelledAt: null }
          : { id, cancelledAt: null, signedAt: null },
        data: { cancelledAt: new Date(), cancelledById: userId, cancelReason: reason },
      });
      if (res.count !== 1) throw new ConflictException(CONCURRENT_CHANGE_MESSAGE);
      await tx.enrollment.updateMany({
        where: { contractDocumentId: id },
        data: { contractDocumentId: null },
      });
      await this.history.recordCreate({
        entityType: 'Student',
        entityId: doc.studentId,
        newValues: {
          action: 'SHARTNOMA_BEKOR_QILINDI',
          raqam: doc.number,
          sabab: reason,
        },
        changedById: userId,
        companyId,
        tx,
      });
      return this.loadView(tx, id);
    });
  }

  async pdf(
    id: string,
    companyId: number,
    userId: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const doc = await this.loadOwned(id, companyId, userId);
    const buffer = await renderContractPdf({
      number: doc.number,
      contractDate: tashkentDateStr(doc.contractDate),
      cancelled: doc.cancelledAt !== null,
      templateVersion: doc.templateVersion,
      fields: doc.fields as unknown as ContractFields,
    });
    return { buffer, filename: `Shartnoma-${doc.number}.pdf` };
  }

  private async loadOwned(id: string, companyId: number, userId: number) {
    const doc = await this.prisma.contractDocument.findFirst({
      where: { id, companyId },
    });
    if (!doc) throw new NotFoundException('Shartnoma topilmadi');
    await assertCallerMayTouchStudent(this.prisma, userId, doc.studentId, companyId);
    return doc;
  }

  private async isCeo(userId: number): Promise<boolean> {
    const caller = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...whereUserMayAct(),
        roles: { some: { role: { name: 'CEO' } } },
      },
      select: { id: true },
    });
    return caller !== null;
  }
```

- [ ] **Step 4: Run** — `npx jest src/contract-documents` → PASS; `npm run typecheck` → clean.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/contract-documents/contract-documents.service.ts src/contract-documents/contract-documents.service.spec.ts
npx eslint src/contract-documents/contract-documents.service.ts src/contract-documents/contract-documents.service.spec.ts
wc -l src/contract-documents/contract-documents.service.ts
cd .. && git add server/src/contract-documents
git commit -m "feat(contract): edit, paper-sign, cancel and print contract documents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `wc -l` under 500.

---

### Task 11: Controller, module and route manifest

**Files:**
- Create: `server/src/contract-documents/contract-documents.controller.ts`, `server/src/contract-documents/contract-documents.module.ts`
- Modify: `server/src/app.module.ts`, `server/src/common/auth/branch-route-policy.ts`
- Test: `server/src/contract-documents/contract-documents.controller.spec.ts` (+ existing `branch-route-policy.spec.ts`)

**Interfaces:**
- Produces routes: `GET /contract-documents?studentId=`, `GET /contract-documents/prefill?studentId=`, `POST /contract-documents`, `PATCH /contract-documents/:id`, `POST /contract-documents/:id/sign`, `POST /contract-documents/:id/cancel`, `GET /contract-documents/:id/pdf` (inline PDF).

- [ ] **Step 1: Write the failing test** — `contract-documents.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { ContractDocumentsController } from './contract-documents.controller';

describe('ContractDocumentsController', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const service = {
    list: jest.fn().mockResolvedValue({ contracts: [], uncovered: [] }),
    prefill: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    sign: jest.fn(),
    cancel: jest.fn(),
    pdf: jest.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-1.3'),
      filename: 'Shartnoma-DAF-2026-00001.pdf',
    }),
  };
  const controller = new ContractDocumentsController(service as never);

  const ctx = (handler: (...args: never[]) => unknown, roles: string[]) =>
    ({
      getHandler: () => handler,
      getClass: () => ContractDocumentsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as never;

  it('is open to CEO, Branch Director and Administrator only', () => {
    expect(reflector.get<string[]>(ROLES_KEY, ContractDocumentsController)).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
    ]);
    expect(guard.canActivate(ctx(controller.list, ['Administrator']))).toBe(true);
    expect(guard.canActivate(ctx(controller.pdf, ['Branch Director']))).toBe(true);
    // RolesGuard throws on a refusal (see lesson-reschedules.controller.spec.ts).
    expect(() => guard.canActivate(ctx(controller.create, ['Teacher']))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctx(controller.cancel, ['Cashier']))).toThrow(
      ForbiddenException,
    );
  });

  it('passes the caller to the service', async () => {
    await controller.list({ studentId: 10001 }, 1, 99);
    expect(service.list).toHaveBeenCalledWith(10001, 1, 99);
    await controller.cancel('doc-1', { reason: 'Xato' }, 1, 99);
    expect(service.cancel).toHaveBeenCalledWith('doc-1', 'Xato', 1, 99);
  });

  it('sends the PDF inline so the browser opens it for printing', async () => {
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.pdf('doc-1', 1, 99, res as never);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="Shartnoma-DAF-2026-00001.pdf"',
    );
    expect(res.end).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/contract-documents/contract-documents.controller.spec.ts` → FAIL.

- [ ] **Step 3: Implement the controller** — `contract-documents.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { ContractDocumentsService } from './contract-documents.service';
import {
  CancelContractDocumentDto,
  CreateContractDocumentDto,
  StudentContractsQueryDto,
  UpdateContractDocumentDto,
} from './dto/contract-document.dto';

/**
 * Student contracts (ADR-0075). The roles of the student profile's tabs;
 * every route checks the student's branch in the service
 * (`assertCallerMayTouchStudent`).
 */
@Controller('contract-documents')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class ContractDocumentsController {
  constructor(private readonly contracts: ContractDocumentsService) {}

  @Get()
  list(
    @Query() query: StudentContractsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.contracts.list(query.studentId, companyId, userId);
  }

  @Get('prefill')
  prefill(
    @Query() query: StudentContractsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.contracts.prefill(query.studentId, companyId, userId);
  }

  @Post()
  create(
    @Body() dto: CreateContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.contracts.create(dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.contracts.update(id, dto, companyId, userId);
  }

  @Post(':id/sign')
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.contracts.sign(id, companyId, userId);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.contracts.cancel(id, dto.reason, companyId, userId);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.contracts.pdf(id, companyId, userId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
```

- [ ] **Step 4: Module and registration** — `contract-documents.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContractDocumentsController } from './contract-documents.controller';
import { ContractDocumentsService } from './contract-documents.service';

@Module({
  imports: [PrismaModule],
  controllers: [ContractDocumentsController],
  providers: [ContractDocumentsService],
})
export class ContractDocumentsModule {}
```

In `server/src/app.module.ts`: add `import { ContractDocumentsModule } from './contract-documents/contract-documents.module';` next to the `StatementsModule` import, and `ContractDocumentsModule,` after `StatementsModule,` in `imports`.

- [ ] **Step 5: Route manifest** — in `server/src/common/auth/branch-route-policy.ts`, add a block to `ROUTE_POLICIES` right after the first `BRANCH_SCOPED_BY_ENTITY` block (the money paths):

```ts
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Student contracts (ADR-0075). Every route resolves the student — from ' +
      'the query for the list and the prefill, from the contract row for the ' +
      'id-addressed ones — and checks the caller against that student branch ' +
      'with `assertCallerMayTouchStudent`. The header branch is never read: a ' +
      'contract belongs to the branch of the student it was made for.',
    routes: [
      'GET /contract-documents',
      'GET /contract-documents/prefill',
      'POST /contract-documents',
      'PATCH /contract-documents/:id',
      'POST /contract-documents/:id/sign',
      'POST /contract-documents/:id/cancel',
      'GET /contract-documents/:id/pdf',
    ],
  },
```

- [ ] **Step 6: Run** — `npx jest src/contract-documents src/common/auth/branch-route-policy.spec.ts` → PASS. If the manifest spec reports a route string mismatch, copy the exact string it prints into the block.

- [ ] **Step 7: Format, lint, build, commit**

```bash
npx prettier --write src/contract-documents src/app.module.ts src/common/auth/branch-route-policy.ts
npx eslint src/contract-documents src/app.module.ts src/common/auth/branch-route-policy.ts
npm run build
cd .. && git add server/src/contract-documents server/src/app.module.ts server/src/common/auth/branch-route-policy.ts
git commit -m "feat(contract): contract document routes, module and branch policy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: A group transfer keeps the contract

**Files:**
- Modify: `server/src/students/student-enrollment.service.ts` (transfer branch of `enrollToGroup`, the `tx.enrollment.create` that makes `fresh`)
- Test: `server/src/students/student-enrollment.service.spec.ts`

- [ ] **Step 1: Write the failing test** — inside `describe('transfer (already has active enrollment)', ...)`:

```ts
      it('moves the contract link to the new enrollment (ADR-0075)', async () => {
        prisma.enrollment.findFirst
          .mockResolvedValueOnce(null) // sameGroup check
          .mockResolvedValueOnce({
            id: 'enroll-old',
            studentId: 1,
            groupId: 'old-group',
            contractDocumentId: 'doc-1',
            group: { teachers: [{ teacherId: 5001 }] },
          });

        await service.enrollToGroup(1, 'group-1', 2, 1001);

        expect(prisma.enrollment.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            studentId: 1,
            groupId: 'group-1',
            contractDocumentId: 'doc-1',
          }),
        });
      });
```

- [ ] **Step 2: Run** — `cd server && npx jest src/students/student-enrollment.service.spec.ts -t "contract link"` → FAIL.

- [ ] **Step 3: Implement** — in the transfer `$transaction`, replace

```ts
          const fresh = await tx.enrollment.create({
            data: { studentId, groupId, startDate: resolvedStartDate },
          });
```

with

```ts
          // A group change keeps the student's contract (ADR-0075); the
          // addendum for the new group comes with stage 3 of the contract work.
          const fresh = await tx.enrollment.create({
            data: {
              studentId,
              groupId,
              startDate: resolvedStartDate,
              contractDocumentId: currentEnrollment.contractDocumentId,
            },
          });
```

(Only the transfer branch. A brand-new enrollment, a re-enrollment after leaving and the Telegram self-registration get no link.)

- [ ] **Step 4: Run** — `npx jest src/students/student-enrollment.service.spec.ts` → PASS (all, not only the new test).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/students/student-enrollment.service.ts src/students/student-enrollment.service.spec.ts
npx eslint src/students/student-enrollment.service.ts src/students/student-enrollment.service.spec.ts
cd .. && git add server/src/students/student-enrollment.service.ts server/src/students/student-enrollment.service.spec.ts
git commit -m "feat(contract): a group transfer keeps the enrollment's contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Client — branch form fields

**Files:**
- Modify: `client/src/lib/branch-record.ts`, `client/src/lib/branch-record.test.ts`, `client/src/hooks/use-edit-branch.ts`, `client/src/components/settings/edit-branch-form.tsx`

- [ ] **Step 1: Update the tests first** — in `branch-record.test.ts`:
  - in `toBranch` `row` add `city: "Namangan", representativeName: null,` (leave `representativePosition` out on purpose);
  - expected object of "turns the id into a string…" becomes:

```ts
    expect(toBranch(row)).toEqual({
      id: "3",
      name: "Filial",
      address: "",
      phone: "901234567",
      status: "CLOSED",
      startOfWorkingDay: "08:00",
      endOfWorkingDay: "",
      city: "Namangan",
      representativeName: "",
      representativePosition: "",
    });
```

  - in `branchUpdateBody` `values` add `city: " Namangan ", representativeName: "", representativePosition: "Direktor",`;
  - expected body of "sends empty optional fields as undefined" becomes:

```ts
    expect(branchUpdateBody(values)).toEqual({
      name: "Filial",
      address: undefined,
      phone: "901234567",
      startOfWorkingDay: "08:00",
      endOfWorkingDay: undefined,
      city: "Namangan",
      representativeName: undefined,
      representativePosition: "Direktor",
    });
```

- [ ] **Step 2: Run** — `cd client && npx vitest run src/lib/branch-record.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`hooks/use-edit-branch.ts` — add to `interface Branch`:

```ts
  /** Printed on the student contract (ADR-0075). */
  city: string;
  representativeName: string;
  representativePosition: string;
```

`lib/branch-record.ts`:
- `BranchApiRow`: add `city?: string | null; representativeName?: string | null; representativePosition?: string | null;`
- `toBranch`: add `city: row.city ?? "", representativeName: row.representativeName ?? "", representativePosition: row.representativePosition ?? "",`
- `BranchFormValues`: add `city: string; representativeName: string; representativePosition: string;`
- `branchUpdateBody`: add

```ts
    city: values.city.trim() || undefined,
    representativeName: values.representativeName.trim() || undefined,
    representativePosition: values.representativePosition.trim() || undefined,
```

`components/settings/edit-branch-form.tsx`:
- `defaultValues`: add `city: branch?.city ?? "", representativeName: branch?.representativeName ?? "", representativePosition: branch?.representativePosition ?? "",`
- the `api.post("/branches", {...})` body: add `city: values.city.trim() || undefined, representativeName: values.representativeName.trim() || undefined, representativePosition: values.representativePosition.trim() || undefined,`
- after the closing `</section>` of «Filial ma'lumotlari», add:

```tsx
      <section className="space-y-5 border-t px-6 py-5">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Shartnoma uchun
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Bu maydonlar o&apos;quvchi shartnomasiga chiqadi. To&apos;ldirilmaguncha
            filial o&apos;quvchilariga shartnoma tuzilmaydi.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Manzil</Label>
          <Input
            id="address"
            placeholder="Masalan: Namangan sh., Istiqlol ko'chasi, 48"
            {...form.register("address")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="city">Shahar</Label>
            <Input id="city" placeholder="Namangan" {...form.register("city")} />
            <p className="text-xs text-muted-foreground">
              «shahri» so&apos;zi shartnomada o&apos;zi qo&apos;shiladi
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="representativePosition">Vakil lavozimi</Label>
            <Input
              id="representativePosition"
              placeholder="Direktor"
              {...form.register("representativePosition")}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="representativeName">Vakil F.I.O.</Label>
          <Input id="representativeName" {...form.register("representativeName")} />
        </div>
      </section>
```

- [ ] **Step 4: Run** — `npx vitest run src/lib/branch-record.test.ts` → PASS; `npx tsc --noEmit` → clean (fix any other place that builds a `Branch` object literal — `tsc` names it; give it the three empty strings).

- [ ] **Step 5: Lint and commit** (no prettier on client)

```bash
npx eslint src/lib/branch-record.ts src/lib/branch-record.test.ts src/hooks/use-edit-branch.ts src/components/settings/edit-branch-form.tsx
cd .. && git add client/src/lib/branch-record.ts client/src/lib/branch-record.test.ts client/src/hooks/use-edit-branch.ts client/src/components/settings/edit-branch-form.tsx
git commit -m "feat(branches): contract fields in the branch settings form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Client — contract rules, types, role lists, PDF opener

**Files:**
- Create: `client/src/components/students/contracts/contract-types.ts`, `client/src/components/students/contracts/contract-rules.ts`
- Modify: `client/src/lib/role-access.ts`, `client/src/lib/download-file.ts`
- Test: `client/src/components/students/contracts/contract-rules.test.ts`

**Interfaces:**
- Produces: the API types (mirror of Task 8); `CONTRACT_ROLES = [1, 2, 3]`, `SIGNED_CONTRACT_CANCEL_ROLES = [1]`; `openAuthedFile(path, fallbackName)`; rules: `CONTRACT_STATUS_LABEL`, `LINK_STATE_LABEL`, `CUSTOMER_KIND_LABEL`, `CUSTOMER_KINDS`, `INCLUDES`, `INCLUDE_LABEL`, `CustomerDraft`, `CourseDraft`, `ageOn`, `isMinor`, `initialKind`, `customerDraft`, `customerDraftFromFields`, `courseDraftFromPrefill`, `courseDraftFromFields`, `createBody`, `updateBody`, `formProblem`, `canCancel`, `upsertContract`, `dateValue`, `dayString`, `dmy`.

- [ ] **Step 1: Types** — `contract-types.ts`:

```ts
/** Mirrors server/src/contract-documents/contract-view.ts (ADR-0075). */
export type CustomerKind = "SELF" | "PARENT" | "GUARDIAN" | "OTHER";
export type ContractInclude = "DARSLIK" | "MATERIALLAR" | "ICHKI_TEST" | "SERTIFIKAT";
export type EnrollmentState = "ACTIVE" | "FROZEN" | "COMPLETED" | "DROPPED" | "TRANSFERRED";
export type ContractStatus = "UNSIGNED" | "SIGNED" | "CANCELLED";

export interface ContractCustomer {
  kind: CustomerKind;
  kindOther: string | null;
  fullName: string;
  birthDate: string | null;
  passport: string | null;
  address: string | null;
  phone: string | null;
  telegram: string | null;
  email: string | null;
}

export interface ContractCourseFields {
  enrollmentId: string;
  courseName: string;
  level: string | null;
  groupName: string;
  teachers: string[];
  startDate: string;
  days: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  lessonsPerWeek: number;
  lessonMinutes: number | null;
  monthlyPrice: number;
  discountPercent: number;
  firstPaymentAmount: number;
  firstPaymentDate: string | null;
  discountReason: string | null;
  discountFrom: string | null;
  discountTo: string | null;
  includes: ContractInclude[];
}

export interface ContractFields {
  branch: {
    name: string;
    city: string;
    address: string;
    representativeName: string;
    representativePosition: string;
  };
  student: { fullName: string; birthDate: string; isMinor: boolean };
  customer: ContractCustomer;
  courses: ContractCourseFields[];
}

export interface ContractView {
  id: string;
  number: string;
  contractDate: string;
  templateVersion: number;
  status: ContractStatus;
  createdAt: string;
  createdBy: string | null;
  signedAt: string | null;
  signedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  fields: ContractFields;
  links: { enrollmentId: string; status: EnrollmentState; groupName: string }[];
}

export interface UncoveredCourse {
  enrollmentId: string;
  status: EnrollmentState;
  courseName: string;
  groupName: string;
}

export interface ContractsResponse {
  contracts: ContractView[];
  uncovered: UncoveredCourse[];
}

export interface PrefillCourse {
  enrollmentId: string;
  status: EnrollmentState;
  courseName: string;
  groupName: string;
  contractNumber: string | null;
  monthlyPrice: number;
  discountPercent: number;
  firstPaymentAmount: number;
}

export interface ContractPrefill {
  today: string;
  branch: { name: string; missing: string[] };
  student: {
    fullName: string;
    birthDate: string | null;
    isMinor: boolean | null;
    phone: string;
    telegram: string | null;
    passport: string | null;
    address: string | null;
    parentName: string | null;
    parentPhone: string | null;
  };
  lastCustomer: ContractCustomer | null;
  courses: PrefillCourse[];
}
```

- [ ] **Step 2: Write the failing test** — `contract-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ageOn,
  canCancel,
  courseDraftFromPrefill,
  createBody,
  customerDraft,
  dayString,
  dateValue,
  formProblem,
  initialKind,
  isMinor,
  upsertContract,
} from "./contract-rules";
import type { ContractPrefill, ContractView } from "./contract-types";

const prefill = (over: Partial<ContractPrefill> = {}): ContractPrefill => ({
  today: "2026-10-10",
  branch: { name: "Namangan filiali", missing: [] },
  student: {
    fullName: "Soliyev Ahror",
    birthDate: "2012-01-01",
    isMinor: true,
    phone: "901234567",
    telegram: "@ahror",
    passport: null,
    address: "Namangan",
    parentName: "Soliyeva Malika",
    parentPhone: "907654321",
  },
  lastCustomer: null,
  courses: [
    {
      enrollmentId: "e-1",
      status: "ACTIVE",
      courseName: "Standart",
      groupName: "#032",
      contractNumber: null,
      monthlyPrice: 450000,
      discountPercent: 10,
      firstPaymentAmount: 405000,
    },
  ],
  ...over,
});

const contract = (over: Partial<ContractView> = {}): ContractView =>
  ({
    id: "doc-1",
    number: "DAF-2026-00001",
    status: "UNSIGNED",
    links: [{ enrollmentId: "e-1", status: "ACTIVE", groupName: "#032" }],
    ...over,
  }) as ContractView;

describe("age", () => {
  it("turns 18 on the birthday", () => {
    expect(ageOn("2008-10-10", "2026-10-09")).toBe(17);
    expect(ageOn("2008-10-10", "2026-10-10")).toBe(18);
    expect(isMinor(null, "2026-10-10")).toBeNull();
    expect(isMinor("2008-10-10", "2026-10-10")).toBe(false);
  });
});

describe("customer drafts", () => {
  it("starts a minor with the parent", () => {
    expect(initialKind(prefill())).toBe("PARENT");
    expect(customerDraft("PARENT", prefill())).toMatchObject({
      fullName: "Soliyeva Malika",
      phone: "907654321",
      address: "Namangan",
    });
  });

  it("starts an adult as their own customer, filled from the profile", () => {
    const adult = prefill({
      student: { ...prefill().student, birthDate: "1995-05-05", isMinor: false },
    });
    expect(initialKind(adult)).toBe("SELF");
    expect(customerDraft("SELF", adult)).toMatchObject({
      fullName: "Soliyev Ahror",
      birthDate: "1995-05-05",
      phone: "901234567",
      telegram: "@ahror",
    });
  });

  it("reuses what the last contract had for the same kind", () => {
    const p = prefill({
      lastCustomer: {
        kind: "PARENT",
        kindOther: null,
        fullName: "Soliyeva Malika",
        birthDate: "1980-03-04",
        passport: "AB1234567",
        address: "Namangan, Uychi 5",
        phone: "907654321",
        telegram: null,
        email: null,
      },
    });
    expect(initialKind(p)).toBe("PARENT");
    expect(customerDraft("PARENT", p)).toMatchObject({
      passport: "AB1234567",
      address: "Namangan, Uychi 5",
      birthDate: "1980-03-04",
    });
  });
});

describe("request body", () => {
  it("drops blanks and keeps the extras per course", () => {
    const body = createBody({
      studentId: 10001,
      enrollmentIds: ["e-1"],
      birthDate: "",
      customer: customerDraft("PARENT", prefill()),
      courses: { "e-1": { ...courseDraftFromPrefill(prefill().courses[0]), includes: ["DARSLIK"] } },
    });
    expect(body).toEqual({
      studentId: 10001,
      enrollmentIds: ["e-1"],
      studentBirthDate: undefined,
      customer: {
        kind: "PARENT",
        kindOther: undefined,
        fullName: "Soliyeva Malika",
        birthDate: undefined,
        passport: undefined,
        address: "Namangan",
        phone: "907654321",
        telegram: undefined,
        email: undefined,
      },
      courses: [
        {
          enrollmentId: "e-1",
          firstPaymentAmount: 405000,
          firstPaymentDate: undefined,
          discountReason: undefined,
          discountFrom: undefined,
          discountTo: undefined,
          includes: ["DARSLIK"],
        },
      ],
    });
  });

  it("explains why saving is not possible yet", () => {
    const customer = customerDraft("SELF", prefill());
    expect(formProblem({ enrollmentIds: [], customer, minor: false })).toMatch(/kursni/);
    expect(formProblem({ enrollmentIds: ["e-1"], customer, minor: true })).toMatch(/Voyaga/);
    expect(
      formProblem({ enrollmentIds: ["e-1"], needsBirthDate: true, birthDate: "", customer, minor: null }),
    ).toMatch(/tug'ilgan/);
    expect(formProblem({ enrollmentIds: ["e-1"], customer, minor: false })).toBeNull();
    expect(
      formProblem({ enrollmentIds: ["e-1"], customer, minor: false, branchMissing: ["shahar"] }),
    ).toMatch(/Filial sozlamasida shahar/);
  });
});

describe("list updates", () => {
  it("lets only the CEO cancel a signed contract", () => {
    expect(canCancel(contract(), false)).toBe(true);
    expect(canCancel(contract({ status: "SIGNED" }), false)).toBe(false);
    expect(canCancel(contract({ status: "SIGNED" }), true)).toBe(true);
    expect(canCancel(contract({ status: "CANCELLED" }), true)).toBe(false);
  });

  it("puts a new contract on top and takes its courses off the warning", () => {
    const next = upsertContract(
      {
        contracts: [],
        uncovered: [{ enrollmentId: "e-1", status: "ACTIVE", courseName: "Standart", groupName: "#032" }],
      },
      contract(),
    );
    expect(next.contracts.map((c) => c.id)).toEqual(["doc-1"]);
    expect(next.uncovered).toEqual([]);
  });

  it("replaces a contract it already has", () => {
    const next = upsertContract(
      { contracts: [contract()], uncovered: [] },
      contract({ status: "SIGNED" }),
    );
    expect(next.contracts).toHaveLength(1);
    expect(next.contracts[0].status).toBe("SIGNED");
  });
});

describe("days", () => {
  it("round-trips the date picker without a timezone shift", () => {
    expect(dayString(dateValue("2026-10-12"))).toBe("2026-10-12");
    expect(dateValue("")).toBeUndefined();
    expect(dayString(undefined)).toBe("");
  });
});
```

- [ ] **Step 3: Run** — `cd client && npx vitest run src/components/students/contracts/contract-rules.test.ts` → FAIL.

- [ ] **Step 4: Implement** — `contract-rules.ts`:

```ts
import { format, parse } from "date-fns";
import type {
  ContractCourseFields,
  ContractCustomer,
  ContractInclude,
  ContractPrefill,
  ContractStatus,
  ContractsResponse,
  ContractView,
  CustomerKind,
  EnrollmentState,
  PrefillCourse,
} from "./contract-types";

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  UNSIGNED: "Imzolanmagan",
  SIGNED: "Imzolangan",
  CANCELLED: "Bekor qilingan",
};

export const LINK_STATE_LABEL: Record<EnrollmentState, string> = {
  ACTIVE: "o'qimoqda",
  FROZEN: "muzlatilgan",
  TRANSFERRED: "guruh almashgan",
  DROPPED: "shu kurs bo'yicha bekor",
  COMPLETED: "yakunlangan",
};

export const CUSTOMER_KINDS: CustomerKind[] = ["SELF", "PARENT", "GUARDIAN", "OTHER"];

export const CUSTOMER_KIND_LABEL: Record<CustomerKind, string> = {
  SELF: "O'quvchining o'zi",
  PARENT: "Ota-ona",
  GUARDIAN: "Vasiy yoki homiy",
  OTHER: "Boshqa",
};

export const INCLUDES: ContractInclude[] = ["DARSLIK", "MATERIALLAR", "ICHKI_TEST", "SERTIFIKAT"];

export const INCLUDE_LABEL: Record<ContractInclude, string> = {
  DARSLIK: "Darslik",
  MATERIALLAR: "Materiallar",
  ICHKI_TEST: "Ichki test",
  SERTIFIKAT: "Sertifikat",
};

/** Form state: every field a string, "" = not filled. */
export interface CustomerDraft {
  kind: CustomerKind;
  kindOther: string;
  fullName: string;
  birthDate: string;
  passport: string;
  address: string;
  phone: string;
  telegram: string;
  email: string;
}

export interface CourseDraft {
  firstPaymentAmount: string;
  firstPaymentDate: string;
  discountReason: string;
  discountFrom: string;
  discountTo: string;
  includes: ContractInclude[];
}

const text = (v: string | null | undefined): string => v ?? "";
const opt = (v: string): string | undefined => (v.trim() ? v.trim() : undefined);

/** Same rule as the server (`ageOn`): a year is complete on the birthday. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export function isMinor(birthDate: string | null, today: string): boolean | null {
  return birthDate ? ageOn(birthDate, today) < 18 : null;
}

export function initialKind(prefill: ContractPrefill): CustomerKind {
  const minor = prefill.student.isMinor === true;
  const last = prefill.lastCustomer?.kind;
  if (last && !(last === "SELF" && minor)) return last;
  return minor ? "PARENT" : "SELF";
}

/** Defaults for a kind: profile first, then what the last contract of that kind had. */
export function customerDraft(kind: CustomerKind, prefill: ContractPrefill): CustomerDraft {
  const st = prefill.student;
  const base: CustomerDraft =
    kind === "SELF"
      ? {
          kind,
          kindOther: "",
          fullName: st.fullName,
          birthDate: text(st.birthDate),
          passport: text(st.passport),
          address: text(st.address),
          phone: text(st.phone),
          telegram: text(st.telegram),
          email: "",
        }
      : {
          kind,
          kindOther: "",
          fullName: text(st.parentName),
          birthDate: "",
          passport: "",
          address: text(st.address),
          phone: text(st.parentPhone),
          telegram: "",
          email: "",
        };
  const last = prefill.lastCustomer;
  if (!last || last.kind !== kind) return base;
  return {
    kind,
    kindOther: text(last.kindOther),
    fullName: kind === "SELF" ? base.fullName : last.fullName || base.fullName,
    birthDate: kind === "SELF" ? base.birthDate : text(last.birthDate),
    passport: text(last.passport) || base.passport,
    address: text(last.address) || base.address,
    phone: text(last.phone) || base.phone,
    telegram: text(last.telegram) || base.telegram,
    email: text(last.email),
  };
}

export function customerDraftFromFields(c: ContractCustomer): CustomerDraft {
  return {
    kind: c.kind,
    kindOther: text(c.kindOther),
    fullName: c.fullName,
    birthDate: text(c.birthDate),
    passport: text(c.passport),
    address: text(c.address),
    phone: text(c.phone),
    telegram: text(c.telegram),
    email: text(c.email),
  };
}

export function courseDraftFromPrefill(c: PrefillCourse): CourseDraft {
  return {
    firstPaymentAmount: String(c.firstPaymentAmount),
    firstPaymentDate: "",
    discountReason: "",
    discountFrom: "",
    discountTo: "",
    includes: [],
  };
}

export function courseDraftFromFields(c: ContractCourseFields): CourseDraft {
  return {
    firstPaymentAmount: String(c.firstPaymentAmount),
    firstPaymentDate: text(c.firstPaymentDate),
    discountReason: text(c.discountReason),
    discountFrom: text(c.discountFrom),
    discountTo: text(c.discountTo),
    includes: [...c.includes],
  };
}

function customerBody(d: CustomerDraft) {
  return {
    kind: d.kind,
    kindOther: d.kind === "OTHER" ? opt(d.kindOther) : undefined,
    fullName: d.fullName.trim(),
    birthDate: opt(d.birthDate),
    passport: opt(d.passport),
    address: opt(d.address),
    phone: opt(d.phone),
    telegram: opt(d.telegram),
    email: opt(d.email),
  };
}

function courseBody(enrollmentId: string, d: CourseDraft) {
  return {
    enrollmentId,
    firstPaymentAmount: d.firstPaymentAmount.trim() ? Number(d.firstPaymentAmount) : undefined,
    firstPaymentDate: opt(d.firstPaymentDate),
    discountReason: opt(d.discountReason),
    discountFrom: opt(d.discountFrom),
    discountTo: opt(d.discountTo),
    includes: d.includes,
  };
}

/** Body of `POST /contract-documents`. */
export function createBody(input: {
  studentId: number;
  enrollmentIds: string[];
  birthDate: string;
  customer: CustomerDraft;
  courses: Record<string, CourseDraft>;
}) {
  return {
    studentId: input.studentId,
    enrollmentIds: input.enrollmentIds,
    studentBirthDate: opt(input.birthDate),
    customer: customerBody(input.customer),
    courses: input.enrollmentIds.map((id) => courseBody(id, input.courses[id])),
  };
}

/** Body of `PATCH /contract-documents/:id` — the whole customer and every course. */
export function updateBody(customer: CustomerDraft, courses: Record<string, CourseDraft>) {
  return {
    customer: customerBody(customer),
    courses: Object.entries(courses).map(([id, d]) => courseBody(id, d)),
  };
}

/** Why «Saqlash» is still disabled; null when the form may be sent. The server re-checks all of it. */
export function formProblem(input: {
  enrollmentIds?: string[];
  needsBirthDate?: boolean;
  birthDate?: string;
  customer: CustomerDraft;
  minor: boolean | null;
  branchMissing?: string[];
}): string | null {
  if (input.branchMissing && input.branchMissing.length > 0) {
    return `Filial sozlamasida ${input.branchMissing.join(", ")} kiritilmagan`;
  }
  if (input.enrollmentIds && input.enrollmentIds.length === 0) return "Kamida bitta kursni tanlang";
  if (input.needsBirthDate && !input.birthDate) return "O'quvchining tug'ilgan sanasini kiriting";
  if (input.minor === true && input.customer.kind === "SELF") {
    return "Voyaga yetmagan o'quvchi o'zi Buyurtmachi bo'la olmaydi";
  }
  if (!input.customer.fullName.trim()) return "Buyurtmachining F.I.O. sini kiriting";
  if (input.customer.kind === "OTHER" && !input.customer.kindOther.trim()) {
    return "Vakillik asosini yozing";
  }
  return null;
}

export function canCancel(c: ContractView, isCeo: boolean): boolean {
  if (c.status === "UNSIGNED") return true;
  return c.status === "SIGNED" && isCeo;
}

/** The list after a create, edit or sign answered with `view`. A cancel also refetches. */
export function upsertContract(res: ContractsResponse, view: ContractView): ContractsResponse {
  const exists = res.contracts.some((c) => c.id === view.id);
  const covered = new Set(view.status === "CANCELLED" ? [] : view.links.map((l) => l.enrollmentId));
  return {
    contracts: exists ? res.contracts.map((c) => (c.id === view.id ? view : c)) : [view, ...res.contracts],
    uncovered: res.uncovered.filter((u) => !covered.has(u.enrollmentId)),
  };
}

/** "YYYY-MM-DD" ↔ the DatePicker's local Date, with no timezone shift. */
export function dateValue(day: string): Date | undefined {
  return day ? parse(day, "yyyy-MM-dd", new Date()) : undefined;
}

export function dayString(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

export function dmy(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}
```

- [ ] **Step 5: Role lists** — append to `client/src/lib/role-access.ts` (before `hasAnyRole`):

```ts
/** `/contract-documents/*` — contract-documents.controller.ts. Kassir va o'qituvchi yo'q. */
export const CONTRACT_ROLES = [1, 2, 3];

/**
 * Imzolangan shartnomani bekor qilish — faqat CEO
 * (`ContractDocumentsService.cancel`, rol bazadan o'qiladi).
 */
export const SIGNED_CONTRACT_CANCEL_ROLES = [1];
```

- [ ] **Step 6: PDF opener** — append to `client/src/lib/download-file.ts`:

```ts
/**
 * Opens an auth-gated PDF in a new tab for printing. The tab is opened
 * before the request, while the click still counts as a user gesture, or the
 * browser blocks it; a blocked tab falls back to a download.
 */
export async function openAuthedFile(path: string, fallbackName: string): Promise<void> {
  const tab = window.open("", "_blank");
  if (!tab) {
    await downloadAuthedFile(path, fallbackName);
    return;
  }
  try {
    const res = await api.get(path, { responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    tab.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab.close();
    throw err;
  }
}
```

- [ ] **Step 7: Run** — `npx vitest run src/components/students/contracts/contract-rules.test.ts` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 8: Lint and commit**

```bash
npx eslint src/components/students/contracts src/lib/role-access.ts src/lib/download-file.ts
cd .. && git add client/src/components/students/contracts client/src/lib/role-access.ts client/src/lib/download-file.ts
git commit -m "feat(contract): client rules, types and the PDF opener

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Client — the «Shartnomalar» tab and dialogs

**Before coding:** invoke the `frontend-design` and `shadcn` skills (client/CLAUDE.md, «Skill Usage Rule»).

**Files:**
- Create in `client/src/components/students/contracts/`: `contract-courses-picker.tsx`, `contract-customer-fields.tsx`, `contract-course-extras.tsx`, `contract-create-form.tsx`, `contract-edit-form.tsx`, `contract-form-dialog.tsx`, `contract-cancel-dialog.tsx`, `contract-card.tsx`, `student-contracts-tab.tsx`
- Modify: `client/src/components/students/student-profile-tabs.tsx`

**Interfaces:**
- Consumes: Task 14 rules/types, `CONTRACT_ROLES`, `SIGNED_CONTRACT_CANCEL_ROLES`, `openAuthedFile`.
- Produces: `<StudentContractsTab studentId onStudentChanged />`.

- [ ] **Step 1: Courses picker** — `contract-courses-picker.tsx`:

```tsx
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatPrice } from "@/lib/format-utils";
import { LINK_STATE_LABEL } from "./contract-rules";
import type { PrefillCourse } from "./contract-types";

interface Props {
  courses: PrefillCourse[];
  value: string[];
  onChange: (ids: string[]) => void;
}

export function ContractCoursesPicker({ courses, value, onChange }: Props) {
  if (courses.length === 0) {
    return (
      <p className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
        O&apos;quvchining faol oylik kursi yo&apos;q — shartnoma tuzib bo&apos;lmaydi.
      </p>
    );
  }
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((x) => x !== id));
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Kurslar</h3>
      <p className="text-xs text-muted-foreground">
        Bitta kurs belgilansa — shu kurs uchun alohida shartnoma. Bir nechtasi belgilansa —
        hammasi bitta shartnomada.
      </p>
      <ul className="divide-y rounded-md border">
        {courses.map((c) => {
          const taken = c.contractNumber !== null;
          const id = `contract-course-${c.enrollmentId}`;
          return (
            <li key={c.enrollmentId} className="flex items-center gap-3 px-3 py-2">
              <Checkbox
                id={id}
                checked={value.includes(c.enrollmentId)}
                disabled={taken}
                onCheckedChange={(on) => toggle(c.enrollmentId, on === true)}
              />
              <label htmlFor={id} className="flex-1 text-sm">
                <span className="font-medium">{c.courseName}</span> · {c.groupName}
                <span className="text-muted-foreground">
                  {" "}
                  · {formatPrice(c.monthlyPrice)} so&apos;m/oy · {LINK_STATE_LABEL[c.status]}
                </span>
              </label>
              {taken && (
                <span className="text-xs text-muted-foreground">№ {c.contractNumber} da bor</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Customer fields** — `contract-customer-fields.tsx`:

```tsx
"use client";

import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CUSTOMER_KINDS,
  CUSTOMER_KIND_LABEL,
  dateValue,
  dayString,
  type CustomerDraft,
} from "./contract-rules";
import type { CustomerKind } from "./contract-types";

interface Props {
  value: CustomerDraft;
  onChange: (next: CustomerDraft) => void;
  onKindChange: (kind: CustomerKind) => void;
  minor: boolean | null;
}

export function ContractCustomerFields({ value, onChange, onKindChange, minor }: Props) {
  const self = value.kind === "SELF";
  const set = <K extends keyof CustomerDraft>(key: K, v: CustomerDraft[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Buyurtmachi</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Buyurtmachi kim</Label>
          <Select value={value.kind} onValueChange={(v) => onKindChange(v as CustomerKind)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOMER_KINDS.map((k) => (
                <SelectItem key={k} value={k} disabled={k === "SELF" && minor === true}>
                  {CUSTOMER_KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {minor === true && (
            <p className="text-xs text-muted-foreground">
              O&apos;quvchi 18 yoshdan kichik — Buyurtmachi ota-ona yoki vasiy bo&apos;ladi.
            </p>
          )}
        </div>

        {value.kind === "OTHER" && (
          <div className="space-y-1.5">
            <Label htmlFor="contract-kind-other">Vakillik asosi</Label>
            <Input
              id="contract-kind-other"
              value={value.kindOther}
              onChange={(e) => set("kindOther", e.target.value)}
              maxLength={100}
            />
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="contract-full-name">F.I.O.</Label>
          <Input
            id="contract-full-name"
            value={value.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            disabled={self}
            maxLength={150}
          />
        </div>

        {!self && (
          <div className="space-y-1.5">
            <Label>Tug&apos;ilgan sana</Label>
            <DatePicker
              value={dateValue(value.birthDate)}
              onChange={(d) => set("birthDate", dayString(d))}
              maxDate={new Date()}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="contract-passport">Pasport / ID seriya, raqami</Label>
          <Input
            id="contract-passport"
            value={value.passport}
            onChange={(e) => set("passport", e.target.value)}
            maxLength={30}
            placeholder="AB 1234567"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="contract-address">Yashash manzili</Label>
          <Input
            id="contract-address"
            value={value.address}
            onChange={(e) => set("address", e.target.value)}
            maxLength={300}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Telefon</Label>
          <PhoneInput value={value.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contract-telegram">Telegram</Label>
          <Input
            id="contract-telegram"
            value={value.telegram}
            onChange={(e) => set("telegram", e.target.value)}
            maxLength={64}
            placeholder="@ism"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="contract-email">E-mail</Label>
          <Input
            id="contract-email"
            type="email"
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
            maxLength={120}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Bo&apos;sh qoldirilgan joy shartnomada chiziq bo&apos;lib chiqadi va qog&apos;ozda qo&apos;lda
        yoziladi.
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Course extras** — `contract-course-extras.tsx`:

```tsx
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import { INCLUDES, INCLUDE_LABEL, dateValue, dayString, type CourseDraft } from "./contract-rules";

interface Props {
  idPrefix: string;
  title: string;
  subtitle: string;
  discountPercent: number;
  value: CourseDraft;
  onChange: (next: CourseDraft) => void;
}

export function ContractCourseExtras({ idPrefix, title, subtitle, discountPercent, value, onChange }: Props) {
  const set = <K extends keyof CourseDraft>(key: K, v: CourseDraft[K]) => onChange({ ...value, [key]: v });
  const from = dateValue(value.discountFrom);
  const to = dateValue(value.discountTo);

  return (
    <section className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-first`}>Dastlabki to&apos;lov</Label>
          <PriceInput
            id={`${idPrefix}-first`}
            value={value.firstPaymentAmount}
            onChange={(e) => set("firstPaymentAmount", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>To&apos;lov sanasi</Label>
          <DatePicker
            value={dateValue(value.firstPaymentDate)}
            onChange={(d) => set("firstPaymentDate", dayString(d))}
          />
        </div>
        {discountPercent > 0 && (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${idPrefix}-reason`}>Chegirma sababi ({discountPercent} %)</Label>
              <Input
                id={`${idPrefix}-reason`}
                value={value.discountReason}
                onChange={(e) => set("discountReason", e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chegirma boshlanishi</Label>
              <DatePicker
                value={from}
                onChange={(d) => set("discountFrom", dayString(d))}
                maxDate={to}
                defaultMonth={to}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chegirma tugashi</Label>
              <DatePicker
                value={to}
                onChange={(d) => set("discountTo", dayString(d))}
                minDate={from}
                defaultMonth={from}
              />
            </div>
          </>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Kurs ichiga kiradigan narsa</Label>
        <div className="flex flex-wrap gap-4">
          {INCLUDES.map((item) => {
            const id = `${idPrefix}-${item}`;
            return (
              <label key={item} htmlFor={id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={id}
                  checked={value.includes.includes(item)}
                  onCheckedChange={(on) =>
                    set(
                      "includes",
                      on === true ? [...value.includes, item] : value.includes.filter((x) => x !== item),
                    )
                  }
                />
                {INCLUDE_LABEL[item]}
              </label>
            );
          })}
        </div>
      </div>
      {discountPercent > 0 && (
        <p className="text-xs text-muted-foreground">
          Chegirma muddati tugaganda tizim chegirmani o&apos;zi olib tashlamaydi — profildagi chegirmani
          qo&apos;lda o&apos;zgartiring.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Create form** — `contract-create-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { ContractCourseExtras } from "./contract-course-extras";
import { ContractCoursesPicker } from "./contract-courses-picker";
import { ContractCustomerFields } from "./contract-customer-fields";
import {
  courseDraftFromPrefill,
  createBody,
  customerDraft,
  dateValue,
  dayString,
  formProblem,
  initialKind,
  isMinor,
  type CourseDraft,
  type CustomerDraft,
} from "./contract-rules";
import type { ContractPrefill, ContractView, CustomerKind } from "./contract-types";

interface Props {
  studentId: number;
  prefill: ContractPrefill;
  onCancel: () => void;
  onSaved: (view: ContractView, studentChanged: boolean) => void;
}

export function ContractCreateForm({ studentId, prefill, onCancel, onSaved }: Props) {
  const free = prefill.courses.filter((c) => c.contractNumber === null);
  const [enrollmentIds, setEnrollmentIds] = useState<string[]>(() =>
    free.length === 1 ? [free[0].enrollmentId] : [],
  );
  const [birthDate, setBirthDate] = useState("");
  const [customer, setCustomer] = useState<CustomerDraft>(() =>
    customerDraft(initialKind(prefill), prefill),
  );
  const [courses, setCourses] = useState<Record<string, CourseDraft>>(() =>
    Object.fromEntries(prefill.courses.map((c) => [c.enrollmentId, courseDraftFromPrefill(c)])),
  );
  const [saving, setSaving] = useState(false);

  const needsBirthDate = prefill.student.birthDate === null;
  const minor = prefill.student.isMinor ?? isMinor(birthDate || null, prefill.today);
  const problem = formProblem({
    enrollmentIds,
    needsBirthDate,
    birthDate,
    customer,
    minor,
    branchMissing: prefill.branch.missing,
  });

  const onBirthDate = (value: string) => {
    setBirthDate(value);
    if (isMinor(value || null, prefill.today) && customer.kind === "SELF") {
      setCustomer(customerDraft("PARENT", prefill));
    }
  };
  const onKind = (kind: CustomerKind) => setCustomer(customerDraft(kind, prefill));

  const submit = async () => {
    if (problem) return;
    setSaving(true);
    try {
      const { data } = await api.post<ContractView>(
        "/contract-documents",
        createBody({ studentId, enrollmentIds, birthDate, customer, courses }),
      );
      toast.success(`Shartnoma ${data.number} tuzildi`);
      onSaved(data, birthDate !== "");
    } catch (err) {
      toast.error(getErrorMessage(err, "Shartnoma tuzishda xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
        {prefill.branch.missing.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              {prefill.branch.name} sozlamasida {prefill.branch.missing.join(", ")} kiritilmagan.
              Sozlamalar → Filiallar bo&apos;limida to&apos;ldiring, keyin shartnoma tuzing.
            </p>
          </div>
        )}

        <ContractCoursesPicker courses={prefill.courses} value={enrollmentIds} onChange={setEnrollmentIds} />

        {needsBirthDate && (
          <section className="space-y-1.5">
            <Label>O&apos;quvchining tug&apos;ilgan sanasi</Label>
            <DatePicker
              value={dateValue(birthDate)}
              onChange={(d) => onBirthDate(dayString(d))}
              maxDate={new Date()}
            />
            <p className="text-xs text-muted-foreground">
              Profilda yo&apos;q — shu yerda kiriting, profilga ham yoziladi. 18 yoshdan kichik
              o&apos;quvchi uchun Buyurtmachi ota-ona yoki vasiy bo&apos;ladi.
            </p>
          </section>
        )}

        <ContractCustomerFields value={customer} onChange={setCustomer} onKindChange={onKind} minor={minor} />

        {enrollmentIds.map((id) => {
          const c = prefill.courses.find((x) => x.enrollmentId === id);
          if (!c) return null;
          return (
            <ContractCourseExtras
              key={id}
              idPrefix={`create-${id}`}
              title={c.courseName}
              subtitle={c.groupName}
              discountPercent={c.discountPercent}
              value={courses[id]}
              onChange={(next) => setCourses((prev) => ({ ...prev, [id]: next }))}
            />
          );
        })}
      </div>
      <DialogFooter className="items-center border-t px-6 py-4">
        {problem && <p className="mr-auto text-xs text-muted-foreground">{problem}</p>}
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Bekor qilish
        </Button>
        <Button onClick={submit} disabled={saving || problem !== null}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Saqlash
        </Button>
      </DialogFooter>
    </>
  );
}
```

- [ ] **Step 5: Edit form** — `contract-edit-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { ContractCourseExtras } from "./contract-course-extras";
import { ContractCustomerFields } from "./contract-customer-fields";
import {
  courseDraftFromFields,
  customerDraftFromFields,
  formProblem,
  updateBody,
  type CourseDraft,
  type CustomerDraft,
} from "./contract-rules";
import type { ContractView, CustomerKind } from "./contract-types";

interface Props {
  contract: ContractView;
  onCancel: () => void;
  onSaved: (view: ContractView) => void;
}

export function ContractEditForm({ contract, onCancel, onSaved }: Props) {
  const f = contract.fields;
  const [customer, setCustomer] = useState<CustomerDraft>(() => customerDraftFromFields(f.customer));
  const [courses, setCourses] = useState<Record<string, CourseDraft>>(() =>
    Object.fromEntries(f.courses.map((c) => [c.enrollmentId, courseDraftFromFields(c)])),
  );
  const [saving, setSaving] = useState(false);
  const problem = formProblem({ customer, minor: f.student.isMinor });

  // Switching the kind starts the block over; SELF takes the student's own name.
  const onKind = (kind: CustomerKind) =>
    setCustomer({
      ...customerDraftFromFields(f.customer),
      kind,
      kindOther: "",
      fullName: kind === "SELF" ? f.student.fullName : "",
      birthDate: kind === "SELF" ? f.student.birthDate : "",
    });

  const submit = async () => {
    if (problem) return;
    setSaving(true);
    try {
      const { data } = await api.patch<ContractView>(
        `/contract-documents/${contract.id}`,
        updateBody(customer, courses),
      );
      toast.success(`Shartnoma ${data.number} yangilandi`);
      onSaved(data);
    } catch (err) {
      toast.error(getErrorMessage(err, "Shartnomani saqlashda xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
        <p className="text-sm text-muted-foreground">
          Kurs, guruh, narx va jadval shartnoma tuzilgan kuni muhrlangan va o&apos;zgarmaydi. Xato
          bo&apos;lsa, shartnomani bekor qilib, yangisini tuzing.
        </p>
        <ContractCustomerFields
          value={customer}
          onChange={setCustomer}
          onKindChange={onKind}
          minor={f.student.isMinor}
        />
        {f.courses.map((c) => (
          <ContractCourseExtras
            key={c.enrollmentId}
            idPrefix={`edit-${c.enrollmentId}`}
            title={c.courseName}
            subtitle={c.groupName}
            discountPercent={c.discountPercent}
            value={courses[c.enrollmentId]}
            onChange={(next) => setCourses((prev) => ({ ...prev, [c.enrollmentId]: next }))}
          />
        ))}
      </div>
      <DialogFooter className="items-center border-t px-6 py-4">
        {problem && <p className="mr-auto text-xs text-muted-foreground">{problem}</p>}
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Bekor qilish
        </Button>
        <Button onClick={submit} disabled={saving || problem !== null}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Saqlash
        </Button>
      </DialogFooter>
    </>
  );
}
```

- [ ] **Step 6: Dialog shell** — `contract-form-dialog.tsx`. The prefill query lives in a child that mounts only while the dialog is open, with `gcTime: 0`, so every opening reads fresh data and the form mounts once with it (no `setState` in an effect):

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { ContractCreateForm } from "./contract-create-form";
import { ContractEditForm } from "./contract-edit-form";
import type { ContractPrefill, ContractView } from "./contract-types";

export type ContractDialogMode = { kind: "create" } | { kind: "edit"; contract: ContractView };

interface Props {
  studentId: number;
  mode: ContractDialogMode | null;
  onClose: () => void;
  onSaved: (view: ContractView, studentChanged: boolean) => void;
}

export function ContractFormDialog({ studentId, mode, onClose, onSaved }: Props) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {mode?.kind === "edit" ? `Shartnoma № ${mode.contract.number}` : "Shartnoma tuzish"}
          </DialogTitle>
          <DialogDescription>
            {mode?.kind === "edit"
              ? "Imzolanmaguncha Buyurtmachi va kurs qo'shimcha ma'lumotlarini o'zgartirish mumkin."
              : "Kurs, guruh, ustoz, jadval va narx o'quvchining ma'lumotlaridan o'zi to'ldiriladi."}
          </DialogDescription>
        </DialogHeader>
        {mode?.kind === "edit" && (
          <ContractEditForm
            contract={mode.contract}
            onCancel={onClose}
            onSaved={(view) => onSaved(view, false)}
          />
        )}
        {mode?.kind === "create" && (
          <CreateLoader studentId={studentId} onCancel={onClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateLoader({
  studentId,
  onCancel,
  onSaved,
}: {
  studentId: number;
  onCancel: () => void;
  onSaved: (view: ContractView, studentChanged: boolean) => void;
}) {
  const prefill = useQuery({
    queryKey: ["contract-prefill", studentId],
    queryFn: () =>
      api
        .get<ContractPrefill>("/contract-documents/prefill", { params: { studentId } })
        .then((r) => r.data),
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (prefill.data) {
    return (
      <ContractCreateForm studentId={studentId} prefill={prefill.data} onCancel={onCancel} onSaved={onSaved} />
    );
  }
  if (prefill.isError) {
    return (
      <div className="flex flex-1 flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
        <Button variant="outline" size="sm" onClick={() => prefill.refetch()}>
          Qayta urinish
        </Button>
      </div>
    );
  }
  return (
    <div className="flex-1 space-y-3 px-6 py-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
```

- [ ] **Step 7: Cancel dialog** — `contract-cancel-dialog.tsx`:

```tsx
"use client";

import { useState, type MouseEvent } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { ContractView } from "./contract-types";

interface Props {
  contract: ContractView | null;
  onClose: () => void;
  onCancelled: (view: ContractView) => void;
}

export function ContractCancelDialog({ contract, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = reason.trim().length >= 3;

  const close = () => {
    if (saving) return;
    setReason("");
    onClose();
  };

  const confirm = async (e: MouseEvent) => {
    e.preventDefault();
    if (!contract || !ready) return;
    setSaving(true);
    try {
      const { data } = await api.post<ContractView>(`/contract-documents/${contract.id}/cancel`, {
        reason: reason.trim(),
      });
      toast.success(`Shartnoma ${data.number} bekor qilindi`);
      setReason("");
      onCancelled(data);
    } catch (err) {
      toast.error(getErrorMessage(err, "Shartnomani bekor qilishda xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={contract !== null} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Shartnoma № {contract?.number} bekor qilinsinmi?</AlertDialogTitle>
          <AlertDialogDescription>
            Shartnomadagi kurslar shartnomasiz bo&apos;lib qoladi va ular uchun yangi shartnoma tuzish
            mumkin bo&apos;ladi. Bekor qilingan shartnoma ro&apos;yxatda qoladi, PDF&apos;i «BEKOR
            QILINGAN» yozuvi bilan chiqadi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="contract-cancel-reason">Sabab</Label>
          <Textarea
            id="contract-cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Ortga</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={!ready || saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Bekor qilish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 8: Contract card** — `contract-card.tsx`:

```tsx
"use client";

import { format } from "date-fns";
import { Ban, CheckCircle2, FileText, Loader2, MoreHorizontal, PenLine, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPrice } from "@/lib/format-utils";
import { CONTRACT_STATUS_LABEL, LINK_STATE_LABEL, canCancel, dmy } from "./contract-rules";
import type { ContractStatus, ContractView } from "./contract-types";

interface Props {
  contract: ContractView;
  isCeo: boolean;
  busy: boolean;
  onPdf: () => void;
  onEdit: () => void;
  onSign: () => void;
  onCancel: () => void;
}

const STATUS_CLASS: Record<ContractStatus, string> = {
  UNSIGNED: "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  SIGNED: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  CANCELLED: "border-transparent bg-muted text-muted-foreground",
};

const stamp = (iso: string) => format(new Date(iso), "dd.MM.yyyy, HH:mm");

export function ContractCard({ contract: c, isCeo, busy, onPdf, onEdit, onSign, onCancel }: Props) {
  const unsigned = c.status === "UNSIGNED";
  const cancellable = canCancel(c, isCeo);
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <span className="font-semibold">№ {c.number}</span>
        <span className="text-sm text-muted-foreground">{dmy(c.contractDate)}</span>
        <Badge variant="outline" className={STATUS_CLASS[c.status]}>
          {CONTRACT_STATUS_LABEL[c.status]}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onPdf} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Printer className="mr-1.5 size-4" />}
            PDF
          </Button>
          {(unsigned || cancellable) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={busy}>
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Amallar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {unsigned && (
                  <DropdownMenuItem onClick={onEdit}>
                    <PenLine className="mr-2 size-4" />
                    Tahrirlash
                  </DropdownMenuItem>
                )}
                {unsigned && (
                  <DropdownMenuItem onClick={onSign}>
                    <CheckCircle2 className="mr-2 size-4" />
                    Qog&apos;ozda imzolandi
                  </DropdownMenuItem>
                )}
                {cancellable && (
                  <DropdownMenuItem onClick={onCancel} className="text-destructive focus:text-destructive">
                    <Ban className="mr-2 size-4" />
                    Bekor qilish
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <ul className="space-y-1 text-sm">
        {c.fields.courses.map((course) => (
          <li key={course.enrollmentId}>
            <span className="font-medium">{course.courseName}</span> · {course.groupName} ·{" "}
            {formatPrice(course.monthlyPrice)} so&apos;m/oy
          </li>
        ))}
      </ul>

      {c.links.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {c.links.map((l) => (
            <li key={l.enrollmentId}>
              Hozir: {l.groupName} — {LINK_STATE_LABEL[l.status]}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Buyurtmachi: {c.fields.customer.fullName}
        {c.createdBy ? ` · Tuzdi: ${c.createdBy}` : ""}
      </p>
      {c.signedAt && (
        <p className="text-xs text-muted-foreground">
          Qog&apos;ozda imzolangan: {stamp(c.signedAt)}
          {c.signedBy ? ` · ${c.signedBy}` : ""}
        </p>
      )}
      {c.cancelledAt && (
        <p className="text-xs text-destructive">
          Bekor qilingan: {stamp(c.cancelledAt)}
          {c.cancelledBy ? ` · ${c.cancelledBy}` : ""} — {c.cancelReason}
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 9: The tab** — `student-contracts-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, FilePlus2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { openAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { SIGNED_CONTRACT_CANCEL_ROLES, hasAnyRole } from "@/lib/role-access";
import { ContractCancelDialog } from "./contract-cancel-dialog";
import { ContractCard } from "./contract-card";
import { ContractFormDialog, type ContractDialogMode } from "./contract-form-dialog";
import { LINK_STATE_LABEL, upsertContract } from "./contract-rules";
import type { ContractView, ContractsResponse } from "./contract-types";

const contractsKey = (studentId: number) => ["contract-documents", studentId] as const;

interface Props {
  studentId: number;
  /** The profile card reloads: creating a contract may have written the birth date. */
  onStudentChanged?: () => void;
}

export function StudentContractsTab({ studentId, onStudentChanged }: Props) {
  const user = useAuth((s) => s.user);
  const isCeo = hasAnyRole(user?.roles, SIGNED_CONTRACT_CANCEL_ROLES);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: contractsKey(studentId),
    queryFn: () =>
      api.get<ContractsResponse>("/contract-documents", { params: { studentId } }).then((r) => r.data),
  });
  const [dialog, setDialog] = useState<ContractDialogMode | null>(null);
  const [signTarget, setSignTarget] = useState<ContractView | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ContractView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = (view: ContractView) =>
    qc.setQueryData<ContractsResponse>(contractsKey(studentId), (prev) =>
      prev ? upsertContract(prev, view) : prev,
    );

  const openPdf = async (c: ContractView) => {
    setBusyId(c.id);
    try {
      await openAuthedFile(`/contract-documents/${c.id}/pdf`, `Shartnoma-${c.number}.pdf`);
    } catch (err) {
      toast.error(getErrorMessage(err, "PDF ochishda xatolik yuz berdi"));
    } finally {
      setBusyId(null);
    }
  };

  const sign = async () => {
    const c = signTarget;
    if (!c) return;
    setSignTarget(null);
    setBusyId(c.id);
    try {
      const { data } = await api.post<ContractView>(`/contract-documents/${c.id}/sign`);
      apply(data);
      toast.success(`Shartnoma ${data.number} qog'ozda imzolangan deb belgilandi`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Belgilashda xatolik yuz berdi"));
    } finally {
      setBusyId(null);
    }
  };

  if (!query.data) {
    if (query.isError) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-10 text-center">
          <p className="text-sm text-muted-foreground">Shartnomalarni yuklab bo&apos;lmadi</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Qayta urinish
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const { contracts, uncovered } = query.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Shartnomalar</h2>
        <Button size="sm" onClick={() => setDialog({ kind: "create" })}>
          <FilePlus2 className="mr-1.5 size-4" />
          Shartnoma tuzish
        </Button>
      </div>

      {uncovered.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-0.5">
            {uncovered.map((u) => (
              <p key={u.enrollmentId}>
                Shartnomasiz kurs: {u.courseName}, {u.groupName} ({LINK_STATE_LABEL[u.status]})
              </p>
            ))}
          </div>
        </div>
      )}

      {contracts.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">
            Hali shartnoma tuzilmagan — «Shartnoma tuzish» tugmasini bosing
          </p>
        </div>
      ) : (
        contracts.map((c) => (
          <ContractCard
            key={c.id}
            contract={c}
            isCeo={isCeo}
            busy={busyId === c.id}
            onPdf={() => openPdf(c)}
            onEdit={() => setDialog({ kind: "edit", contract: c })}
            onSign={() => setSignTarget(c)}
            onCancel={() => setCancelTarget(c)}
          />
        ))
      )}

      <ContractFormDialog
        studentId={studentId}
        mode={dialog}
        onClose={() => setDialog(null)}
        onSaved={(view, studentChanged) => {
          apply(view);
          setDialog(null);
          if (studentChanged) onStudentChanged?.();
        }}
      />

      <AlertDialog open={signTarget !== null} onOpenChange={(open) => !open && setSignTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Shartnoma № {signTarget?.number} qog&apos;ozda imzolandimi?</AlertDialogTitle>
            <AlertDialogDescription>
              Buyurtmachi imzolagan nusxa markazda saqlanadi. Belgilangandan keyin shartnoma
              o&apos;zgarmaydi; xato bo&apos;lsa, uni faqat CEO bekor qila oladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ortga</AlertDialogCancel>
            <AlertDialogAction onClick={sign}>Ha, imzolandi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContractCancelDialog
        contract={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={(view) => {
          apply(view);
          setCancelTarget(null);
          void qc.invalidateQueries({ queryKey: contractsKey(studentId) });
        }}
      />
    </div>
  );
}
```

- [ ] **Step 10: Wire the tab into the profile** — in `student-profile-tabs.tsx`:
  - import `{ StudentContractsTab } from "./contracts/student-contracts-tab"` and `{ CONTRACT_ROLES, hasAnyRole } from "@/lib/role-access"`;
  - after `const canManage = …` add `const canContracts = hasAnyRole(user?.roles, CONTRACT_ROLES);`
  - next to the other lazy flags add:

```tsx
  const [contractsVisible, setContractsVisible] = useState(false);
  const contractsShown = useRef(false);
```

  - in `handleTabChange` add:

```tsx
      if (value === "shartnomalar" && !contractsShown.current) {
        contractsShown.current = true;
        setContractsVisible(true);
      }
```

  - in `<TabsList>` after the «To'lovlar» trigger add:

```tsx
          {canContracts && <TabsTrigger value="shartnomalar">Shartnomalar</TabsTrigger>}
```

  - after the «To'lovlar» `TabsContent` add:

```tsx
        {/* Shartnomalar (ADR-0075) */}
        {canContracts && (
          <TabsContent value="shartnomalar">
            {contractsVisible && (
              <StudentContractsTab studentId={student.id} onStudentChanged={onEnrollmentChange} />
            )}
          </TabsContent>
        )}
```

- [ ] **Step 11: Verify** — from `client/`:

```bash
npx tsc --noEmit
npx eslint src/components/students/contracts src/components/students/student-profile-tabs.tsx
npx vitest run src/components/students/contracts
```

Expected: no type errors, no lint errors, rules tests PASS. Check every new file is under 300 lines (`wc -l src/components/students/contracts/*.tsx`); split a section into its own file if one is not.

- [ ] **Step 12: Commit**

```bash
cd .. && git add client/src/components/students/contracts client/src/components/students/student-profile-tabs.tsx
git commit -m "feat(contract): «Shartnomalar» tab with create, edit, sign, cancel and PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: ADR, guide and docs

**Files:**
- Create: `docs/adr/0075-shartnoma-hujjati-alohida-jadval.md`, `client/src/qollanma/kontent/oquvchilar/shartnoma.mdx`
- Modify: `docs/adr/README.md`, `docs/role-access.md`, `CONTEXT.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, `client/src/qollanma/sahifalar/oquvchilar.ts`, `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: Check the ADR number** — `ls docs/adr | tail -3`. If `0075` is taken by now, use the next free number everywhere below (file name, title, guide `adr` list, client/server CLAUDE notes).

- [ ] **Step 2: ADR** — `docs/adr/0075-shartnoma-hujjati-alohida-jadval.md`:

```markdown
# ADR-0075 — Shartnoma hujjati alohida jadvalda, tuzilganda muhrlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** spec `docs/superpowers/specs/2026-10-10-shartnoma-hujjati-design.md`, spec `docs/superpowers/specs/2026-09-24-shartnoma-tolov-qoidalari-design.md` (2-bo'lim), `server/src/contract-documents/`, `server/src/common/finance/per-lesson-price.ts`

## Kontekst

24.09 da kelishilgan: shartnoma — shablon, o'zgarmas matn va tizim to'ldiradigan
maydonlar; o'quvchi profilidan chop etiladi; imzolangan kundagi qiymatlar
o'quvchiga muhrlanadi. 02.10 da yakuniy matn tayyor bo'ldi.

Bazada eski `Contract` jadvali bor. Prod'da unda 0 ta yozuv (10.10), lekin uni pul
kodi o'qiydi: bir dars narxi avval ACTIVE `Contract` summasidan olinadi
(`per-lesson-price.ts`), dars yechimi `group.contracts[0]?.id` ni yozadi, to'lov
`Contract.paidAmount` ni oshiradi, qaytarish uning holatini o'zgartiradi. Unga
shartnoma hujjatini yozsak, to'lov va dars hisobi unga bog'lana boshlaydi.

O'quvchi bir vaqtda faqat bitta faol kursda (`unique_active_enrollment_per_student`).
Admin esa har kursga alohida shartnoma yoki bir nechta kursni bitta shartnomada
tuzishni tanlashi kerak (10.10).

## Qaror

1. Shartnoma hujjati yangi `ContractDocument` jadvalida. Eski `Contract` ga yozilmaydi.
2. PDF'ga tushadigan hamma qiymat `fields` (JSON) ga shartnoma tuzilganda yoziladi:
   filial, o'quvchi, Buyurtmachi, kurslar (narx, chegirma, guruh, ustoz, jadval).
   Filial, o'quvchi va kurs qismi keyin o'zgarmaydi. Buyurtmachi va kursning qo'shimcha
   maydonlari (dastlabki to'lov, sana, chegirma sababi va muddati, kursga kiradigan
   narsalar) imzogacha tahrirlanadi, keyin qulflanadi.
3. Matn kodda versiyalanadi (`templateVersion`). 1-versiya — 02.10 yakuniy matn,
   `docs/tolov-savollari/shartnoma-2026-yakuniy.txt` bilan test solishtiradi. Yurist
   tuzatsa, 2-versiya qo'shiladi; eski shartnomalar o'z versiyasida chiqadi.
4. Kurs bog'lanishi `Enrollment.contractDocumentId`: bitta yozilish — ko'pi bilan
   bitta amaldagi shartnoma, bitta shartnoma — bir nechta yozilish. Guruh almashganda
   bog'lanish yangi yozilishga o'tadi. Shartnoma bekor qilinganda bog'lanish uziladi.
   Kurs bekor bo'lsa (o'quvchi chiqsa), shartnoma faqat shu kurs bo'yicha bekor —
   holat yozilishning o'zidan o'qiladi.
5. Raqam `DAF-YYYY-NNNNN`: yil — shartnoma kunining Toshkent yili, kompaniya ichida
   unikal.
6. Imzo hozircha faqat qog'ozda (`signMethod = PAPER`). Bekor qilish: imzolanmagan —
   CEO, filial direktori, administrator; imzolangan — faqat CEO, roli bazadan
   o'qiladi (ADR-0028). Sabab majburiy.
7. Filialda shahar, manzil, vakil ismi va lavozimi bo'lmasa, shartnoma tuzilmaydi:
   ular muhrlanadi, bo'sh holda tuzilgan shartnoma bo'sh qoladi.

## Oqibatlar

**Yutildi:** pul kodi yangi jadvalni bilmaydi, shartnoma to'lov hisobiga ta'sir
qilmaydi. Chop etilgan va saqlangan matn bir xil — PDF har safar `fields` dan yasaladi,
fayl saqlanmaydi.

**Yo'qotildi:** narx yoki jadval o'zgarsa, eski shartnoma eski qiymatda qoladi —
qo'shimcha kelishuvsiz (3-bosqich) yangilanmaydi. Matnni o'zgartirish uchun dasturchi
kerak (yangi versiya fayli).

**Keyinga:** botda «Roziman» (`signMethod = BOT`), qo'shimcha kelishuvlar,
«tasdiqlamagan o'quvchi 2-darsga kirmaydi» qoidasi, matndagi raqamlarni To'lov
sozlamalaridan olish, 12 talik kurslar shartnomasi.
```

- [ ] **Step 3: Index row** — in `docs/adr/README.md`, after the `0074` row:

```markdown
| [0075](0075-shartnoma-hujjati-alohida-jadval.md) | Shartnoma hujjati alohida `ContractDocument` jadvalida: qiymatlar tuzilganda muhrlanadi, matn versiyalanadi, guruh almashganda bog'lanish o'tadi, eski `Contract` ishlatilmaydi | Qabul qilindi | 2026-10-10 |
```

- [ ] **Step 4: role-access.md** — add after the debt section's bullet list (before `### Groups`):

```markdown
### Student contracts

The «Shartnomalar» tab on the student profile (`/contract-documents/*`, ADR-0075). Everyone below the CEO acts only on students of their own branch.

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| See contracts, open the PDF | Yes | Yes | Yes | No | No |
| Create, edit an unsigned contract, mark it signed on paper | Yes | Yes | Yes | No | No |
| Cancel an unsigned contract | Yes | Yes | Yes | No | No |
| Cancel a signed contract | Yes | No | No | No | No |

- **Frontend**: `CONTRACT_ROLES` and `SIGNED_CONTRACT_CANCEL_ROLES` in `client/src/lib/role-access.ts`
```

- [ ] **Step 5: CONTEXT.md** — after the `**Enrollment**` entry add:

```markdown
**Shartnoma hujjati (ContractDocument)** — o'quvchi bilan tuzilgan ta'lim
xizmati shartnomasi: raqami (`DAF-YYYY-NNNNN`), Buyurtmachi, kurslari va o'sha
kundagi narxlari (`fields`, tuzilganda muhrlanadi). Eski `Contract` emas — u pul
kodiga bog'langan (ADR-0075). Yozilish `contractDocumentId` orqali bog'lanadi;
guruh almashganda bog'lanish yangi yozilishga o'tadi.
`contract-documents/contract-documents.service.ts`
```

- [ ] **Step 6: server/CLAUDE.md** — under `#### Contracts (model retained, user-facing CRUD module removed)`, add a bullet at the end:

```markdown
- **The student contract document is a different model: `ContractDocument` (ADR-0075, `src/contract-documents/`).** It never writes `Contract`, because money code reads that model (`per-lesson-price.ts`, payments, refunds). All printed values are sealed into `ContractDocument.fields` at creation; the customer block and the course extras change only while the contract is unsigned. `Enrollment.contractDocumentId` links courses (carried to the new enrollment on a group transfer in `enrollToGroup`, cleared on cancel). The PDF is rebuilt from `fields` on every request (`pdf/contract-pdf.ts`), and the text is versioned (`pdf/contract-template-v1.ts`, checked against `docs/tolov-savollari/shartnoma-2026-yakuniy.txt`) — a text change is a new version file, never an edit. Cancelling a signed contract is CEO-only, read from the database. A branch needs `city`, `address`, `representativeName` and `representativePosition` before a contract can be made.
```

- [ ] **Step 7: client/CLAUDE.md** — in «Student Profile Tabs» change «has **10 tabs**» to «has **11 tabs**» and add a table row after «To'lovlar»:

```markdown
| Shartnomalar | `shartnomalar` | Student contracts (ADR-0075): create, edit while unsigned, «Qog'ozda imzolandi», cancel (signed — CEO only), PDF in a new tab. `components/students/contracts/`; pure rules in `contract-rules.ts` (tested). Visible to `CONTRACT_ROLES` |
```

- [ ] **Step 8: Guide page** — `client/src/qollanma/kontent/oquvchilar/shartnoma.mdx`:

```mdx
O'quvchi profilidagi «Shartnomalar» tabida o'quvchining ta'lim xizmati shartnomalari turadi. Kurs, guruh, ustoz, jadval, narx va chegirmani tizim o'quvchining ma'lumotlaridan o'zi to'ldiradi.

## Shartnoma tuzish

1. O'quvchi profilida «Shartnomalar» tabini oching.
2. «Shartnoma tuzish» tugmasini bosing.
3. Shartnomaga kiradigan kurslarni belgilang. Bitta kurs belgilansa, shu kurs uchun alohida shartnoma tuziladi. Bir nechtasi belgilansa, hammasi bitta shartnomaga kiradi.
4. Profilda tug'ilgan sana bo'lmasa, uni kiriting. U profilga ham yoziladi. 18 yoshdan kichik o'quvchi uchun Buyurtmachi ota-ona yoki vasiy bo'ladi.
5. Buyurtmachining pasporti, manzili va telefonini tekshiring. Bo'sh qoldirilgan joy shartnomada chiziq bo'lib chiqadi va qog'ozda qo'lda yoziladi.
6. Har bir kurs uchun dastlabki to'lov sanasini va kursga kiradigan narsalarni belgilang.
7. «Saqlash» ni bosing. Shartnomaga raqam beriladi, masalan DAF-2026-00001.

<Eslatma tur="diqqat">Filial sozlamasida shahar, manzil, vakil ismi va lavozimi to'ldirilmagan bo'lsa, shartnoma tuzilmaydi. Ularni Sozlamalar → Filiallar bo'limida filialni tahrirlab to'ldiring.</Eslatma>

## Chop etish va imzolash

- «PDF» tugmasi shartnomani yangi oynada ochadi. Shu yerdan chop eting.
- Buyurtmachi qog'ozda imzolagach, «Qog'ozda imzolandi» ni bosing. Shundan keyin shartnoma o'zgarmaydi.
- Imzolanmagan shartnomada Buyurtmachi ma'lumotlari va kursning qo'shimcha maydonlari «Tahrirlash» orqali o'zgaradi.

## Nima saqlanadi

Shartnoma tuzilgan kundagi kurs narxi, chegirma, guruh, ustoz va jadval shartnomaning o'zida saqlanadi. Keyin kurs narxi yoki guruh jadvali o'zgarsa ham, PDF tuzilgan kundagidek chiqadi. Ma'lumot xato bo'lsa, shartnomani bekor qilib, yangisini tuzing.

## Kurs o'zgarsa

- Guruh almashsa, shartnoma yangi guruhga ham o'tadi. Ro'yxatda «Hozir:» qatori o'quvchining hozirgi guruhini ko'rsatadi.
- O'quvchi kursdan chiqsa, shartnoma faqat shu kurs bo'yicha bekor bo'ladi. Pul shartnomaning 6.2-bandi bo'yicha shu kursdan hisoblanadi.
- Kursdan chiqib, keyin qaytib yozilgan o'quvchiga yangi shartnoma tuziladi. Faol kurs shartnomasiz bo'lsa, tab tepasida sariq ogohlantirish chiqadi.

## Bekor qilish

Imzolanmagan shartnomani CEO, filial direktori yoki administrator bekor qila oladi, imzolanganini faqat CEO. Sabab yozish majburiy. Bekor qilingan shartnoma ro'yxatda qoladi, PDF'i «BEKOR QILINGAN» yozuvi bilan chiqadi, uning kurslari uchun yangi shartnoma tuzish mumkin bo'ladi.
```

- [ ] **Step 9: Guide registry** — append to the `oquvchilar` array in `client/src/qollanma/sahifalar/oquvchilar.ts` (set `yangilangan` to the Tashkent day you commit; never a future day):

```ts
  {
    bolim: "oquvchilar",
    sahifa: "shartnoma",
    sarlavha: "Shartnoma",
    qisqacha:
      "O'quvchi profilidagi «Shartnomalar» tabida shartnoma tuziladi, PDF qilib chop etiladi va qog'ozda imzolangani belgilanadi. Kurs, narx va Buyurtmachi ma'lumotlari tuzilgan kuni muhrlanadi.",
    rollar: [1, 2, 3],
    adr: ["0075"],
    yollar: ["/students/profile/*"],
    kalitSozlar: [
      "shartnoma",
      "shartnoma tuzish",
      "pdf",
      "chop etish",
      "imzolash",
      "qog'ozda imzolandi",
      "buyurtmachi",
      "ota-ona",
      "vasiy",
      "pasport",
      "dastlabki to'lov",
      "shartnoma raqami",
      "shartnomani bekor qilish",
      "filial vakili",
    ],
    yangilangan: "2026-10-10",
  },
```

- [ ] **Step 10: News entry** — at the top of the `yangiliklar` array in `client/src/qollanma/yangiliklar.ts` (same date as above):

```ts
  {
    sana: "2026-10-10",
    sarlavha: "O'quvchi shartnomasi tizimda tuziladi",
    matn: "O'quvchi profilida «Shartnomalar» tabi qo'shildi. «Shartnoma tuzish» kurs, guruh, ustoz, jadval, narx va chegirmani o'quvchining ma'lumotlaridan o'zi to'ldiradi; Buyurtmachining pasporti, manzili va kursga kiradigan narsalarni shu oynada kiritasiz. Bir nechta kurs bitta shartnomaga yoki har biri alohida shartnomaga kiradi. «PDF» chop etishga tayyor shartnomani ochadi, Buyurtmachi imzolagach «Qog'ozda imzolandi» bosiladi. Shartnoma tuzishdan oldin filial sozlamasiga shahar, manzil, vakil ismi va lavozimini kiriting.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "shartnoma" },
  },
```

- [ ] **Step 11: Run the guide tests** — `cd client && npx vitest run src/qollanma` → PASS (registry ↔ MDX, routes, dates, no `# h1`).

- [ ] **Step 12: Commit**

```bash
cd .. && git add docs/adr CONTEXT.md docs/role-access.md server/CLAUDE.md client/CLAUDE.md client/src/qollanma
git commit -m "docs(contract): ADR-0075, user guide page and role matrix for contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Full verification and a manual run

**Files:** none (fixes only, if something fails).

- [ ] **Step 1: Server gates** — from `server/`:

```bash
npm test
npm run typecheck
npx eslint src --quiet
npm run build
```

Expected: all suites pass (note the count), no type errors, no lint errors, build ok. Fix and re-run only what failed.

- [ ] **Step 2: Client gates** — from `client/`:

```bash
npx vitest run
npx tsc --noEmit
npx eslint src --quiet
npm run build
```

Expected: all green. `npm run build` takes minutes — run it once, in the background if needed.

- [ ] **Step 3: Production read-only checks** (ask nothing is written; probes go under `server/scripts/_probe-*.ts` and are deleted afterwards — see memory «Running One-off DB Probe Scripts»):
  - every MONTHLY course's language is German (spec §7 «Tekshiriladi»): list `Course.name` of MONTHLY courses with live enrollments; if a non-German course exists, stop and tell the user (a `Course.language` field would be needed);
  - how many branches lack `city` / `address` / representative (expected: all, until the admin fills them).

- [ ] **Step 4: Manual run** (the migration is already on the dev DB from Task 1): start server and client from the worktree with the `run` skill or `.claude/launch.json`, sign in as a CEO on localhost, then:
  1. Sozlamalar → Filiallar → a branch → fill «Shartnoma uchun» → save;
  2. open a student with an ACTIVE monthly course → «Shartnomalar» → «Shartnoma tuzish» → choose the course, fill the customer, save → a card with `№ DAF-…` appears and the amber warning disappears;
  3. «PDF» opens a new tab with the contract: header, parties, table 2.1, all sections, requisites, marketing block; 2 – 5 pages;
  4. «Tahrirlash» → change the passport → save → PDF shows it;
  5. «Qog'ozda imzolandi» → the edit item disappears;
  6. as an Administrator (or by API) try to cancel the signed contract → 403 text; as the CEO cancel → «BEKOR QILINGAN» on the PDF, the warning comes back;
  7. student profile «Tarix» shows SHARTNOMA_TUZILDI / TAHRIRLANDI / IMZOLANDI / BEKOR_QILINDI rows.
  Take one screenshot of the tab and one PDF page for the report to the user.

- [ ] **Step 5: Report** — tell the user in Uzbek, briefly: what was built, test counts, what was checked by hand, that nothing is pushed or deployed, and the two follow-ups (fill branch fields in production after deploy; stage 2 «Roziman»).
