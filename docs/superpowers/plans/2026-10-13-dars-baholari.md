# Dars baholari — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi darsdan keyin Telegram botda darsga 1–5 baho (va 1–3 da ixtiyoriy izoh) qo'yadi; baholarni faqat CEO «Hisobotlar → Dars baholari» sahifasida va ustoz profilidagi «Baholar» tab'ida ko'radi.

**Architecture:** Yangi `server/src/lesson-ratings/` moduli: cron (`LessonRatingSenderService`) tugagan darslarni «Dars bo'ldimi?» bilan umumiy yuklovchi (`loadEndedLessonsToday`) orqali topib, kelgan o'quvchilarga tugmali xabar yuboradi; `LessonRatingTelegramHandler` tugma va izoh javobini `useBeforeScenes` orqali ushlaydi; `LessonRatingsService` + `@CeoOnly()` controller hisobotni beradi. Hisob qoidalari sof funksiyalarda (`rating-rules.ts`, `rating-math.ts`). Klient: `components/reports/lesson-ratings/`.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Telegraf, Jest (server); Next.js, React Query, shadcn/ui, Vitest (client).

**Spec:** `docs/superpowers/specs/2026-10-13-dars-baholari-design.md`

## Global Constraints

- Ish joyi: worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/dars-baholari` (shox `feat/dars-baholari`). Worktree'da `node_modules` yo'q — birinchi topshiriqdan oldin `npm install` (`server/` va `client/` da).
- Server testlari `server/` ichidan: `npx jest <path>`. Klient testlari `client/` ichidan: `npx vitest --config vitest.config.ts run <path>`.
- Har tegilgan server `.ts` fayliga `npx prettier --write`. Klient fayllariga prettier ISHLATILMAYDI.
- Bazaga hech narsa yozilmaydi (lokal `.env` prod'ga qarashi mumkin): migration SQL qo'lda yoziladi, faqat `npx prisma validate` va `npx prisma generate` ishlatiladi. Migration deploy'da qo'llanadi.
- Commit xabarlari o'zbekcha, oxirida: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- UI matnlari o'zbekcha; sanalar `dd.MM.yyyy`; raqamlar `formatNumber` / `formatPercent` (`@/lib/format-utils`).
- Baholarni faqat CEO ko'radi: server — `@CeoOnly()`, klient — `isCeoUser(user)` / `forRoles: [1]`. Imkoniyat (capability) katalogiga hech narsa qo'shilmaydi.
- Sozlama kaliti: `lessonRating.enabled`, `companyLevelOnly: true`, boshlang'ich qiymat `false`.
- Baho muddati 48 soat; izoh ≤ 500 belgi; past baho = `score ≤ 3`; yuborish oynasi — dars tugaganidan 10 daqiqa … 180 daqiqa; cron `'0 */10 7-22 * * 1-6'`, `Asia/Tashkent`.
- Hisobot oyi tagi (floor): `2026-10`.

---

### Task 1: Tugagan darslarni yuklovchini ajratish

«Dars bo'ldimi?» va baho bir xil darslarni so'rashi uchun `endedLessonsOn` kirishlarini yuklash bitta funksiyaga chiqariladi. Xatti-harakat o'zgarmaydi.

**Files:**
- Create: `server/src/attendance/shared/load-ended-lessons.ts`
- Create: `server/src/attendance/shared/load-ended-lessons.spec.ts`
- Modify: `server/src/attendance/unmarked-lessons.service.ts:52-110` (`openForEndedLessons` boshi)

**Interfaces:**
- Produces: `loadEndedLessonsToday(prisma: PrismaService, holidays: Pick<HolidaysService, 'findActiveHolidayCovering'>, now?: Date): Promise<EndedLessonsToday>`; `EndedLessonsToday = { todayStr: string; nowMinutes: number; today: Date; lessons: EndedLesson[] }`. `EndedLesson` — `attendance/shared/ended-lessons.ts`dagi tip (`groupId, groupName, companyId, branchId, startTime, endTime`).

- [ ] **Step 1: Worktree'ga paketlarni o'rnatish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/dars-baholari/server && npm install && npx prisma generate
cd ../client && npm install
```

- [ ] **Step 2: Failing test yozish** — `server/src/attendance/shared/load-ended-lessons.spec.ts`

```ts
import { loadEndedLessonsToday } from './load-ended-lessons';

// 2026-10-12 — dushanba. 05:30Z = 10:30 Toshkent.
const NOW = new Date('2026-10-12T05:30:00Z');

function group(id: string, branchId = 1) {
  return {
    id,
    name: `#${id}`,
    companyId: 1,
    branchId,
    exactDays: ['monday'],
    lessonStartTime: '08:30',
    lessonEndTime: '10:00',
    startDate: null,
    endDate: null,
  };
}

function setup(over: {
  groups?: ReturnType<typeof group>[];
  cancelled?: string[];
  holidayBranches?: number[];
}) {
  const prisma = {
    group: { findMany: jest.fn().mockResolvedValue(over.groups ?? []) },
    lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
    lessonCancellation: {
      findMany: jest
        .fn()
        .mockResolvedValue((over.cancelled ?? []).map((groupId) => ({ groupId }))),
    },
  };
  const holidays = {
    findActiveHolidayCovering: jest.fn(async (_d: Date, branchId: number) =>
      (over.holidayBranches ?? []).includes(branchId) ? { id: 'h' } : null,
    ),
  };
  return { prisma, holidays };
}

describe('loadEndedLessonsToday', () => {
  it('returns today and the lessons that have ended', async () => {
    const { prisma, holidays } = setup({ groups: [group('a')] });
    const r = await loadEndedLessonsToday(prisma as never, holidays, NOW);
    expect(r.todayStr).toBe('2026-10-12');
    expect(r.nowMinutes).toBe(10 * 60 + 30);
    expect(r.today.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(r.lessons.map((l) => l.groupId)).toEqual(['a']);
    expect(r.lessons[0].endTime).toBe('10:00');
  });

  it('leaves out a cancelled lesson and a branch on holiday', async () => {
    const { prisma, holidays } = setup({
      groups: [group('a'), group('b'), group('c', 2)],
      cancelled: ['a'],
      holidayBranches: [2],
    });
    const r = await loadEndedLessonsToday(prisma as never, holidays, NOW);
    expect(r.lessons.map((l) => l.groupId)).toEqual(['b']);
  });

  it('asks nothing more when there are no active groups', async () => {
    const { prisma, holidays } = setup({ groups: [] });
    const r = await loadEndedLessonsToday(prisma as never, holidays, NOW);
    expect(r.lessons).toEqual([]);
    expect(holidays.findActiveHolidayCovering).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Test yiqilishini ko'rish**

Run: `cd server && npx jest src/attendance/shared/load-ended-lessons.spec.ts`
Expected: FAIL — `Cannot find module './load-ended-lessons'`

- [ ] **Step 4: Implementatsiya** — `server/src/attendance/shared/load-ended-lessons.ts`

```ts
import { GroupStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { HolidaysService } from '../../holidays/holidays.service';
import { utcMidnightFromDateStr } from '../../common/date/tashkent';
import { tashkentClock } from './attendance-window';
import { endedLessonsOn, type EndedLesson } from './ended-lessons';

export interface EndedLessonsToday {
  todayStr: string;
  nowMinutes: number;
  /** Bugun, `@db.Date` ko'rinishida (UTC yarim tun). */
  today: Date;
  lessons: EndedLesson[];
}

/**
 * Bugun `now`gacha tugagan darslar — `endedLessonsOn`ning kirishlari bir marta
 * o'qiladi: faol guruhlar, bugungi ko'chirish va bekor qilishlar, har filial
 * bayrami. «Dars bo'ldimi?» (ADR-0054) va dars bahosi (spec 2026-10-13) shuni
 * chaqiradi, shuning uchun ikkalasi bir xil darslar haqida so'raydi.
 */
export async function loadEndedLessonsToday(
  prisma: PrismaService,
  holidays: Pick<HolidaysService, 'findActiveHolidayCovering'>,
  now: Date = new Date(),
): Promise<EndedLessonsToday> {
  const { todayStr, nowMinutes } = tashkentClock(now);
  const today = utcMidnightFromDateStr(todayStr);

  const [groups, reschedules, cancellations] = await Promise.all([
    prisma.group.findMany({
      where: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        companyId: true,
        branchId: true,
        exactDays: true,
        lessonStartTime: true,
        lessonEndTime: true,
        startDate: true,
        endDate: true,
      },
    }),
    prisma.lessonReschedule.findMany({
      where: {
        deletedAt: null,
        OR: [{ originalDate: today }, { newDate: today }],
      },
      select: {
        groupId: true,
        originalDate: true,
        newDate: true,
        newLessonStartTime: true,
        newLessonEndTime: true,
      },
    }),
    prisma.lessonCancellation.findMany({
      where: { deletedAt: null, date: today },
      select: { groupId: true },
    }),
  ]);
  if (groups.length === 0) return { todayStr, nowMinutes, today, lessons: [] };

  const holidayBranches = new Set<number>();
  for (const branchId of new Set(groups.map((g) => g.branchId))) {
    if (await holidays.findActiveHolidayCovering(today, branchId)) {
      holidayBranches.add(branchId);
    }
  }
  const lessons = endedLessonsOn({
    todayStr,
    nowMinutes,
    groups,
    reschedules,
    cancelledGroupIds: new Set(cancellations.map((c) => c.groupId)),
    isHoliday: (branchId) => holidayBranches.has(branchId),
  });
  return { todayStr, nowMinutes, today, lessons };
}
```

- [ ] **Step 5: `openForEndedLessons`ni yuklovchiga o'tkazish** — `server/src/attendance/unmarked-lessons.service.ts`

`openForEndedLessons` boshidagi blokni (`const { todayStr, nowMinutes } = tashkentClock(now);` dan `if (ended.length === 0) return [];` gacha) quyidagiga almashtiring:

```ts
  async openForEndedLessons(now: Date = new Date()): Promise<OpenedLesson[]> {
    const { todayStr } = tashkentClock(now);
    const today = utcMidnightFromDateStr(todayStr);

    const [loaded, existing] = await Promise.all([
      loadEndedLessonsToday(this.prisma, this.holidays, now),
      this.prisma.unmarkedLesson.findMany({
        where: { date: today },
        select: { groupId: true },
      }),
    ]);
    const asked = new Set(existing.map((e) => e.groupId));
    const ended = loaded.lessons.filter((lesson) => !asked.has(lesson.groupId));
    if (ended.length === 0) return [];
```

Import qo'shing: `import { loadEndedLessonsToday } from './shared/load-ended-lessons';`. Endi ishlatilmaydigan importlarni olib tashlang: `GroupStatus` (agar faylda boshqa joyda yo'q bo'lsa — `grep -n GroupStatus` bilan tekshiring), `endedLessonsOn` (`EndedLesson` tipi qoladi). Funksiyaning qolgan qismi (`dueAtByBranch` dan keyin) o'zgarmaydi va `todayStr`, `today`, `ended` nomlarini ishlatishda davom etadi.

- [ ] **Step 6: Testlar o'tishini tekshirish**

Run: `cd server && npx jest src/attendance/shared/load-ended-lessons.spec.ts src/attendance/unmarked-lessons src/attendance/attendance-reminder`
Expected: PASS (barcha mavjud «Dars bo'ldimi?» spec'lari o'zgarishsiz yashil)

- [ ] **Step 7: Prettier, eslint, commit**

```bash
cd server && npx prettier --write src/attendance/shared/load-ended-lessons.ts src/attendance/shared/load-ended-lessons.spec.ts src/attendance/unmarked-lessons.service.ts
npx eslint src/attendance/shared/load-ended-lessons.ts src/attendance/unmarked-lessons.service.ts
git add src/attendance/shared/load-ended-lessons.ts src/attendance/shared/load-ended-lessons.spec.ts src/attendance/unmarked-lessons.service.ts
git commit -m "refactor(attendance): tugagan darslarni yuklash bitta yordamchida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Jadval, migration va sozlama

**Files:**
- Modify: `server/prisma/schema.prisma` (yangi enum + model; `Student` va `Group`ga teskari relatsiya)
- Create: `server/prisma/migrations/20261016100000_lesson_ratings/migration.sql`
- Modify: `server/src/settings/settings.types.ts` (kalit, tip, ta'rif)
- Modify: `server/src/settings/settings.types.spec.ts:11-26` (kalitlar ro'yxati)

**Interfaces:**
- Produces: Prisma `LessonRating` modeli (maydonlar spec §4 dagidek), `LessonRatingStatus` enumi (`SENT | FAILED`), `Student.lessonRatings`, `Group.lessonRatings`; `SettingKey` ga `'lessonRating.enabled'` (`boolean`).

- [ ] **Step 1: Sozlama testini yangilash (failing)** — `server/src/settings/settings.types.spec.ts`, ro'yxatga qo'shing:

```ts
        'payment.paidThroughReminderDays',
        'lessonRating.enabled',
      ].sort(),
```

Run: `cd server && npx jest src/settings/settings.types.spec.ts`
Expected: FAIL (`lessonRating.enabled` registrda yo'q)

- [ ] **Step 2: Sozlamani registrga qo'shish** — `server/src/settings/settings.types.ts`

`SettingKey` ittifoqiga: `| 'lessonRating.enabled'`; `SettingValueMap`ga: `'lessonRating.enabled': boolean;`; `SETTING_DEFINITIONS`ga (`'payment.paidThroughReminderDays'` yozuvidan keyin):

```ts
  'lessonRating.enabled': {
    key: 'lessonRating.enabled',
    // Darsdan keyin o'quvchidan Telegram'da baho so'rash (spec 2026-10-13).
    // O'chiq chiqadi — CEO «Dars baholari» sahifasida yoqadi.
    // `LessonRatingSenderService` kompaniya bo'yicha o'qiydi.
    defaultValue: false,
    parse: (raw) => parseBoolean('lessonRating.enabled', raw),
    companyLevelOnly: true,
  },
```

Run: `cd server && npx jest src/settings`
Expected: PASS

- [ ] **Step 3: Prisma sxemasi** — `server/prisma/schema.prisma` oxiriga:

```prisma
enum LessonRatingStatus {
  SENT // qator yozildi; messageId bo'lsa xabar yetgan
  FAILED // Telegram rad etdi — qayta urinilmaydi
}

/// Darsdan keyin o'quvchidan so'ralgan baho (spec 2026-10-13, yangi ADR).
/// Bitta dars, bitta o'quvchi — bitta qator; qator xabardan OLDIN yoziladi,
/// shuning uchun ikki parallel cron bir o'quvchiga ikki marta yubora olmaydi.
model LessonRating {
  id              String             @id @default(uuid())
  companyId       Int
  /// Guruh filiali, yuborilgan paytda muzlatiladi (hisobot doirasi).
  branchId        Int
  groupId         String
  group           Group              @relation(fields: [groupId], references: [id])
  studentId       Int
  student         Student            @relation(fields: [studentId], references: [id])
  date            DateTime           @db.Date
  /// Dars ustozlari (override hisobga olingan), yuborilgan paytda muzlatiladi.
  teacherIds      Int[]
  chatId          String
  /// Yetkazilgan xabar; null — yetmagan.
  messageId       Int?
  /// «Nima yoqmadi?» so'rovi (force_reply).
  promptMessageId Int?
  status          LessonRatingStatus @default(SENT)
  /// 1–5.
  score           Int?
  /// ≤ 500 belgi.
  comment         String?
  sentAt          DateTime           @default(now())
  ratedAt         DateTime?
  commentedAt     DateTime?
  failReason      String?

  @@unique([groupId, studentId, date])
  @@index([companyId, date])
  @@index([chatId, promptMessageId])
}
```

`model Student { ... }` ichiga qo'shing: `lessonRatings LessonRating[]`
`model Group { ... }` ichiga qo'shing: `lessonRatings LessonRating[]`

- [ ] **Step 4: Migration SQL** — `server/prisma/migrations/20261016100000_lesson_ratings/migration.sql`

```sql
-- Dars baholari (spec 2026-10-13): o'quvchi darsdan keyin Telegram'da 1–5 baho qo'yadi.
DO $$
BEGIN
  CREATE TYPE "LessonRatingStatus" AS ENUM ('SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LessonRating" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER NOT NULL,
  "groupId" TEXT NOT NULL,
  "studentId" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "teacherIds" INTEGER[],
  "chatId" TEXT NOT NULL,
  "messageId" INTEGER,
  "promptMessageId" INTEGER,
  "status" "LessonRatingStatus" NOT NULL DEFAULT 'SENT',
  "score" INTEGER,
  "comment" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ratedAt" TIMESTAMP(3),
  "commentedAt" TIMESTAMP(3),
  "failReason" TEXT,
  CONSTRAINT "LessonRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LessonRating_groupId_studentId_date_key"
  ON "LessonRating"("groupId", "studentId", "date");
CREATE INDEX IF NOT EXISTS "LessonRating_companyId_date_idx"
  ON "LessonRating"("companyId", "date");
CREATE INDEX IF NOT EXISTS "LessonRating_chatId_promptMessageId_idx"
  ON "LessonRating"("chatId", "promptMessageId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonRating_groupId_fkey') THEN
    ALTER TABLE "LessonRating"
      ADD CONSTRAINT "LessonRating_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonRating_studentId_fkey') THEN
    ALTER TABLE "LessonRating"
      ADD CONSTRAINT "LessonRating_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
```

- [ ] **Step 5: Sxemani tekshirish va klientni yaratish**

Run: `cd server && npx prisma validate && npx prisma generate && npm run typecheck`
Expected: «The schema … is valid», generate muvaffaqiyatli, typecheck xatosiz.

Agar bazaga faqat O'QISH huquqi bilan ulanish mumkin bo'lsa (ixtiyoriy tekshiruv, hech narsa yozmaydi): `npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script` — chiqishda faqat `LessonRating` jadvali, enum, indekslar va ikki FK bo'lishi kerak (SQL bilan solishtiring; farq bo'lsa migration'ni tuzating).

- [ ] **Step 6: Commit**

```bash
cd server && npx prettier --write src/settings/settings.types.ts src/settings/settings.types.spec.ts
git add prisma/schema.prisma prisma/migrations/20261016100000_lesson_ratings src/settings/settings.types.ts src/settings/settings.types.spec.ts
git commit -m "feat(lesson-ratings): LessonRating jadvali va lessonRating.enabled sozlamasi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sof qoidalar — bot matnlari va hisob

**Files:**
- Create: `server/src/lesson-ratings/rating-rules.ts`
- Create: `server/src/lesson-ratings/rating-rules.spec.ts`
- Create: `server/src/lesson-ratings/rating-math.ts`
- Create: `server/src/lesson-ratings/rating-math.spec.ts`

**Interfaces:**
- Produces (`rating-rules.ts`): `ASK_AFTER_MIN = 10`, `ASK_UNTIL_MIN = 180`, `RATING_WINDOW_MS`, `COMMENT_MAX = 500`, `LOW_SCORE_MAX = 3`; `shouldAskNow(endTime: string, nowMinutes: number): boolean`; `ratingQuestion(a: { studentFirstName: string; groupName: string; teacherNames: string[] }): string`; `ratingKeyboard(ratingId: string): { inline_keyboard: { text: string; callback_data: string }[][] }`; `parseRatingCallback(data: string): { ratingId: string; score: number } | null`; `thanksText(score: number): string`; `isWithinWindow(sentAt: Date, now: Date): boolean`; `cleanComment(text: string): string | null`; matn konstantalari `ASK_COMMENT, COMMENT_SAVED, COMMENT_ALREADY, NOT_YOURS, EXPIRED, ALREADY_RATED, TRY_LATER`.
- Produces (`rating-math.ts`): `RatingRow = { score: number | null; delivered: boolean; teacherIds: number[] }`; `RatingTotals = { average: number | null; rated: number; delivered: number; responseRate: number | null; low: number }`; `totalsOf(rows: RatingRow[]): RatingTotals`; `byTeacher(rows: RatingRow[]): Map<number, RatingTotals>`; `sortByAverage<T extends { average: number | null }>(list: T[]): T[]`.

- [ ] **Step 1: Failing testlar** — `server/src/lesson-ratings/rating-rules.spec.ts`

```ts
import {
  cleanComment,
  isWithinWindow,
  parseRatingCallback,
  ratingKeyboard,
  ratingQuestion,
  shouldAskNow,
  thanksText,
} from './rating-rules';

const ID = '11111111-2222-3333-4444-555555555555';

describe('shouldAskNow', () => {
  it('asks from 10 minutes after the end up to 3 hours', () => {
    expect(shouldAskNow('10:00', 10 * 60 + 9)).toBe(false);
    expect(shouldAskNow('10:00', 10 * 60 + 10)).toBe(true);
    expect(shouldAskNow('10:00', 13 * 60)).toBe(true);
    expect(shouldAskNow('10:00', 13 * 60 + 1)).toBe(false);
  });
});

describe('ratingQuestion', () => {
  it('names the student, the group and every teacher, HTML-escaped', () => {
    const text = ratingQuestion({
      studentFirstName: 'Ali',
      groupName: 'A1 <3>',
      teacherNames: ['Anna Schmidt', 'Vali Karimov'],
    });
    expect(text).toBe(
      "📚 <b>Ali</b>, bugungi «A1 &lt;3&gt;» darsi qanday o'tdi?\n" +
        'Ustoz: Anna Schmidt, Vali Karimov\n\nBaho bering:',
    );
  });

  it('drops the teacher line when nobody taught', () => {
    const text = ratingQuestion({ studentFirstName: 'Ali', groupName: 'A1', teacherNames: [] });
    expect(text).not.toContain('Ustoz:');
  });
});

describe('ratingKeyboard / parseRatingCallback', () => {
  it('builds five buttons in one row that parse back', () => {
    const kb = ratingKeyboard(ID);
    expect(kb.inline_keyboard).toHaveLength(1);
    expect(kb.inline_keyboard[0].map((b) => b.text)).toEqual(['1 ⭐', '2 ⭐', '3 ⭐', '4 ⭐', '5 ⭐']);
    expect(kb.inline_keyboard[0][3].callback_data).toBe(`lr:${ID}:4`);
    expect(Buffer.byteLength(kb.inline_keyboard[0][3].callback_data)).toBeLessThanOrEqual(64);
    expect(parseRatingCallback(`lr:${ID}:4`)).toEqual({ ratingId: ID, score: 4 });
  });

  it('refuses anything else', () => {
    expect(parseRatingCallback(`lr:${ID}:6`)).toBeNull();
    expect(parseRatingCallback(`lr:${ID}:0`)).toBeNull();
    expect(parseRatingCallback('lr:abc:3')).toBeNull();
    expect(parseRatingCallback(`tk:list`)).toBeNull();
  });
});

describe('isWithinWindow', () => {
  it('is open for 48 hours', () => {
    const sent = new Date('2026-10-12T10:00:00Z');
    expect(isWithinWindow(sent, new Date('2026-10-14T09:59:59Z'))).toBe(true);
    expect(isWithinWindow(sent, new Date('2026-10-14T10:00:01Z'))).toBe(false);
  });
});

describe('cleanComment', () => {
  it('trims, cuts at 500 and turns blank into null', () => {
    expect(cleanComment('  zerikarli edi  ')).toBe('zerikarli edi');
    expect(cleanComment('   ')).toBeNull();
    expect(cleanComment('x'.repeat(600))).toHaveLength(500);
  });
});

describe('thanksText', () => {
  it('repeats the score', () => {
    expect(thanksText(4)).toBe("Rahmat! Siz 4 ⭐ qo'ydingiz.");
  });
});
```

`server/src/lesson-ratings/rating-math.spec.ts`

```ts
import { byTeacher, sortByAverage, totalsOf, type RatingRow } from './rating-math';

const row = (score: number | null, teacherIds = [1], delivered = true): RatingRow => ({
  score,
  delivered,
  teacherIds,
});

describe('totalsOf', () => {
  it('averages only rated rows, one decimal', () => {
    const t = totalsOf([row(5), row(4), row(2), row(null), row(null, [1], false)]);
    expect(t).toEqual({ average: 3.7, rated: 3, delivered: 4, responseRate: 75, low: 1 });
  });

  it('answers null when there is nothing to average', () => {
    expect(totalsOf([])).toEqual({
      average: null,
      rated: 0,
      delivered: 0,
      responseRate: null,
      low: 0,
    });
  });
});

describe('byTeacher', () => {
  it('counts a two-teacher lesson for both', () => {
    const m = byTeacher([row(5, [1, 2]), row(3, [2])]);
    expect(m.get(1)).toMatchObject({ average: 5, rated: 1 });
    expect(m.get(2)).toMatchObject({ average: 4, rated: 2, low: 1 });
  });
});

describe('sortByAverage', () => {
  it('puts the lowest first and the unrated last', () => {
    const sorted = sortByAverage([
      { id: 'a', average: 4.8 },
      { id: 'b', average: null },
      { id: 'c', average: 3.1 },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/lesson-ratings`
Expected: FAIL — modullar topilmaydi

- [ ] **Step 3: `rating-rules.ts`**

```ts
import { toMinutes } from '../attendance/shared/attendance-window';
import { escapeHtml } from '../telegram-groups/utils/format.util';

/** Dars tugaganidan keyin so'rash oynasi, daqiqalarda (spec §3.2). */
export const ASK_AFTER_MIN = 10;
export const ASK_UNTIL_MIN = 180;
/** Tugma va izoh shu muddat ichida qabul qilinadi. */
export const RATING_WINDOW_MS = 48 * 60 * 60 * 1000;
export const COMMENT_MAX = 500;
/** Shu va undan past baho — «past baho»: izoh so'raladi, ro'yxatga tushadi. */
export const LOW_SCORE_MAX = 3;

export const ASK_COMMENT = "Nima yoqmadi? Shu xabarga javob qilib yozing (ixtiyoriy).";
export const COMMENT_SAVED = 'Rahmat, fikringiz yetkazildi.';
export const COMMENT_ALREADY = 'Fikringiz allaqachon yozilgan.';
export const NOT_YOURS = "Bu so'rov sizga emas";
export const EXPIRED = "Baho berish muddati o'tgan";
export const ALREADY_RATED = 'Siz allaqachon baho bergansiz';
export const TRY_LATER = "Keyinroq urinib ko'ring";

const CALLBACK = /^lr:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-5])$/;

export function shouldAskNow(endTime: string, nowMinutes: number): boolean {
  const since = nowMinutes - toMinutes(endTime);
  return since >= ASK_AFTER_MIN && since <= ASK_UNTIL_MIN;
}

export function ratingQuestion(a: {
  studentFirstName: string;
  groupName: string;
  teacherNames: string[];
}): string {
  const lines = [
    `📚 <b>${escapeHtml(a.studentFirstName)}</b>, bugungi «${escapeHtml(a.groupName)}» darsi qanday o'tdi?`,
  ];
  if (a.teacherNames.length > 0) {
    lines.push(`Ustoz: ${a.teacherNames.map(escapeHtml).join(', ')}`);
  }
  return `${lines.join('\n')}\n\nBaho bering:`;
}

export function ratingKeyboard(ratingId: string) {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5].map((n) => ({
        text: `${n} ⭐`,
        callback_data: `lr:${ratingId}:${n}`,
      })),
    ],
  };
}

export function parseRatingCallback(
  data: string,
): { ratingId: string; score: number } | null {
  const m = CALLBACK.exec(data);
  return m ? { ratingId: m[1], score: Number(m[2]) } : null;
}

export function thanksText(score: number): string {
  return `Rahmat! Siz ${score} ⭐ qo'ydingiz.`;
}

export function isWithinWindow(sentAt: Date, now: Date): boolean {
  return now.getTime() - sentAt.getTime() <= RATING_WINDOW_MS;
}

export function cleanComment(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, COMMENT_MAX) : null;
}
```

- [ ] **Step 4: `rating-math.ts`**

```ts
import { LOW_SCORE_MAX } from './rating-rules';

export interface RatingRow {
  score: number | null;
  /** Xabar o'quvchiga yetgan (`messageId` bor). */
  delivered: boolean;
  teacherIds: number[];
}

export interface RatingTotals {
  /** Faqat baho qo'yilganlar bo'yicha, bir xona; baho yo'q — null. */
  average: number | null;
  rated: number;
  delivered: number;
  /** rated / delivered, foizda, bir xona; yetkazilgan yo'q — null. */
  responseRate: number | null;
  low: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function totalsOf(rows: RatingRow[]): RatingTotals {
  let sum = 0;
  let rated = 0;
  let delivered = 0;
  let low = 0;
  for (const r of rows) {
    if (r.delivered) delivered += 1;
    if (r.score === null) continue;
    rated += 1;
    sum += r.score;
    if (r.score <= LOW_SCORE_MAX) low += 1;
  }
  return {
    average: rated ? round1(sum / rated) : null,
    rated,
    delivered,
    responseRate: delivered ? round1((rated / delivered) * 100) : null,
    low,
  };
}

/** Ikki ustozli dars ikkalasiga ham sanaladi (spec §6.2). */
export function byTeacher(rows: RatingRow[]): Map<number, RatingTotals> {
  const groups = new Map<number, RatingRow[]>();
  for (const r of rows) {
    for (const id of r.teacherIds) {
      const list = groups.get(id) ?? [];
      list.push(r);
      groups.set(id, list);
    }
  }
  return new Map([...groups].map(([id, list]) => [id, totalsOf(list)]));
}

/** Eng past o'rtacha tepada, bahosizlar oxirida. */
export function sortByAverage<T extends { average: number | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.average === null) return b.average === null ? 0 : 1;
    if (b.average === null) return -1;
    return a.average - b.average;
  });
}
```

- [ ] **Step 5: Testlar o'tishi**

Run: `cd server && npx jest src/lesson-ratings`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd server && npx prettier --write src/lesson-ratings && npx eslint src/lesson-ratings
git add src/lesson-ratings
git commit -m "feat(lesson-ratings): bot matnlari va baho hisobi — sof funksiyalar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Yuboruvchi cron va modul

**Files:**
- Create: `server/src/lesson-ratings/lesson-rating-sender.service.ts`
- Create: `server/src/lesson-ratings/lesson-rating-sender.service.spec.ts`
- Create: `server/src/lesson-ratings/lesson-ratings.module.ts`
- Modify: `server/src/app.module.ts` (import + `imports` ro'yxati)

**Interfaces:**
- Consumes: `loadEndedLessonsToday` (Task 1), `shouldAskNow`, `ratingQuestion`, `ratingKeyboard` (Task 3), `SettingsService.get(companyId, 'lessonRating.enabled')` (Task 2), `TelegramService.getBot()`, `sendTelegramText(bot, chatId, text, extra)` → `{ ok: true, messageId } | { ok: false, kind, code, description }`.
- Produces: `LessonRatingSenderService.run(now?: Date): Promise<number>` (yuborilgan xabarlar soni); `LessonRatingsModule`.

- [ ] **Step 1: Failing test** — `server/src/lesson-ratings/lesson-rating-sender.service.spec.ts`

```ts
import { Prisma } from '@prisma/client';
import { LessonRatingSenderService } from './lesson-rating-sender.service';

// 2026-10-12 dushanba; dars 08:30–10:00.
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12, h - 5, m));
};

function setup(over: {
  enabled?: boolean;
  attendees?: { id: number; firstName: string; telegramChatId: string }[];
  override?: number[] | null;
  createError?: unknown;
  sendError?: unknown;
} = {}) {
  const prisma = {
    group: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'g1',
          name: 'A1-3',
          companyId: 1,
          branchId: 7,
          exactDays: ['monday'],
          lessonStartTime: '08:30',
          lessonEndTime: '10:00',
          startDate: null,
          endDate: null,
        },
      ]),
    },
    lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
    lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
    attendance: {
      findMany: jest.fn().mockResolvedValue(
        (over.attendees ?? [{ id: 10001, firstName: 'Ali', telegramChatId: '555' }]).map(
          (student) => ({ student }),
        ),
      ),
    },
    lessonTeacherOverride: {
      findFirst: jest
        .fn()
        .mockResolvedValue(over.override ? { teacherIds: over.override } : null),
    },
    groupTeacher: { findMany: jest.fn().mockResolvedValue([{ teacherId: 20001 }]) },
    user: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
        where.id.in.map((id) => ({ id, firstName: 'Anna', lastName: `T${id}` })),
      ),
    },
    lessonRating: {
      create: over.createError
        ? jest.fn().mockRejectedValue(over.createError)
        : jest.fn().mockResolvedValue({ id: 'r1' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const holidays = { findActiveHolidayCovering: jest.fn().mockResolvedValue(null) };
  const settings = { get: jest.fn().mockResolvedValue(over.enabled ?? true) };
  const sendMessage = over.sendError
    ? jest.fn().mockRejectedValue(over.sendError)
    : jest.fn().mockResolvedValue({ message_id: 77 });
  const telegram = { getBot: () => ({ telegram: { sendMessage } }) };
  const service = new LessonRatingSenderService(
    prisma as never,
    holidays as never,
    settings as never,
    telegram as never,
  );
  return { service, prisma, settings, sendMessage };
}

describe('LessonRatingSenderService', () => {
  it('asks a present student 20 minutes after the lesson and keeps the message id', async () => {
    const { service, prisma, sendMessage } = setup();
    await expect(service.run(at('10:20'))).resolves.toBe(1);

    expect(prisma.lessonRating.create).toHaveBeenCalledWith({
      data: {
        companyId: 1,
        branchId: 7,
        groupId: 'g1',
        studentId: 10001,
        date: new Date('2026-10-12T00:00:00.000Z'),
        teacherIds: [20001],
        chatId: '555',
      },
      select: { id: true },
    });
    const [chatId, text, extra] = sendMessage.mock.calls[0];
    expect(chatId).toBe('555');
    expect(text).toContain('<b>Ali</b>');
    expect(text).toContain('Ustoz: Anna T20001');
    expect(extra.parse_mode).toBe('HTML');
    expect(extra.reply_markup.inline_keyboard[0][0].callback_data).toBe('lr:r1:1');
    expect(prisma.lessonRating.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { messageId: 77 },
    });
  });

  it('asks only present or late students with a working chat and no rating yet', async () => {
    const { service, prisma } = setup();
    await service.run(at('10:20'));
    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 'g1',
          date: new Date('2026-10-12T00:00:00.000Z'),
          status: { in: ['PRESENT', 'LATE'] },
          cancellationId: null,
          student: {
            deletedAt: null,
            telegramChatId: { not: null },
            telegramDisconnectedAt: null,
            lessonRatings: {
              none: { groupId: 'g1', date: new Date('2026-10-12T00:00:00.000Z') },
            },
          },
        },
      }),
    );
  });

  it('waits 10 minutes and stops after 3 hours', async () => {
    const early = setup();
    await expect(early.service.run(at('10:05'))).resolves.toBe(0);
    const late = setup();
    await expect(late.service.run(at('13:30'))).resolves.toBe(0);
    expect(late.prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('does nothing while the setting is off', async () => {
    const { service, prisma } = setup({ enabled: false });
    await expect(service.run(at('10:20'))).resolves.toBe(0);
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('takes the substitute teachers of an override', async () => {
    const { service, prisma } = setup({ override: [30001, 30002] });
    await service.run(at('10:20'));
    expect(prisma.lessonRating.create.mock.calls[0][0].data.teacherIds).toEqual([30001, 30002]);
    expect(prisma.groupTeacher.findMany).not.toHaveBeenCalled();
  });

  it('skips a student another instance already took', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const { service, sendMessage } = setup({ createError: dup });
    await expect(service.run(at('10:20'))).resolves.toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('marks a refused message FAILED and does not retry', async () => {
    const err = Object.assign(new Error('Forbidden: bot was blocked by the user'), {
      response: { error_code: 403, description: 'Forbidden: bot was blocked by the user' },
    });
    const { service, prisma } = setup({ sendError: err });
    await expect(service.run(at('10:20'))).resolves.toBe(0);
    expect(prisma.lessonRating.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'FAILED', failReason: expect.stringContaining('blocked') },
    });
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/lesson-ratings/lesson-rating-sender.service.spec.ts`
Expected: FAIL — modul topilmaydi

- [ ] **Step 3: Servis** — `server/src/lesson-ratings/lesson-rating-sender.service.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AttendanceStatus, LessonRatingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { SettingsService } from '../settings/settings.service';
import { TelegramService } from '../telegram/telegram.service';
import { loadEndedLessonsToday } from '../attendance/shared/load-ended-lessons';
import type { EndedLesson } from '../attendance/shared/ended-lessons';
import {
  describeError,
  sendTelegramText,
  type TelegramTextSender,
} from '../telegram-digest/telegram-send';
import { ratingKeyboard, ratingQuestion, shouldAskNow } from './rating-rules';

/**
 * Dars tugagach kelgan o'quvchidan baho so'raydi (spec 2026-10-13 §3, §5.1).
 * Qator xabardan OLDIN yoziladi: `@@unique([groupId, studentId, date])` ikki
 * parallel instansni bitta xabarga keltiradi. Telegram rad etsa — FAILED,
 * qayta urinilmaydi. Darhol yuboriladi (yangi ADR, ADR-0025 ro'yxatiga qo'shimcha).
 */
@Injectable()
export class LessonRatingSenderService {
  private readonly logger = new Logger(LessonRatingSenderService.name);

  constructor(
    private prisma: PrismaService,
    private holidays: HolidaysService,
    private settings: SettingsService,
    private telegram: TelegramService,
  ) {}

  @Cron('0 */10 7-22 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    try {
      await this.run();
    } catch (err) {
      this.logger.error(`lesson rating run failed: ${describeError(err)}`);
    }
  }

  /** Yuborilgan xabarlar soni. */
  async run(now: Date = new Date()): Promise<number> {
    const bot = this.telegram.getBot() as TelegramTextSender | undefined;
    if (!bot) return 0;
    const { today, nowMinutes, lessons } = await loadEndedLessonsToday(
      this.prisma,
      this.holidays,
      now,
    );
    const due = lessons.filter((l) => shouldAskNow(l.endTime, nowMinutes));
    const enabled = new Map<number, boolean>();
    let sent = 0;
    for (const lesson of due) {
      if (!enabled.has(lesson.companyId)) {
        enabled.set(
          lesson.companyId,
          await this.settings.get(lesson.companyId, 'lessonRating.enabled'),
        );
      }
      if (!enabled.get(lesson.companyId)) continue;
      try {
        sent += await this.askLesson(bot, lesson, today);
      } catch (err) {
        this.logger.error(
          `lesson rating for ${lesson.groupId} failed: ${describeError(err)}`,
        );
      }
    }
    return sent;
  }

  private async askLesson(
    bot: TelegramTextSender,
    lesson: EndedLesson,
    today: Date,
  ): Promise<number> {
    const attendees = await this.prisma.attendance.findMany({
      where: {
        groupId: lesson.groupId,
        date: today,
        status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        cancellationId: null,
        student: {
          deletedAt: null,
          telegramChatId: { not: null },
          telegramDisconnectedAt: null,
          lessonRatings: { none: { groupId: lesson.groupId, date: today } },
        },
      },
      select: {
        student: { select: { id: true, firstName: true, telegramChatId: true } },
      },
    });
    if (attendees.length === 0) return 0;

    const teacherIds = await this.lessonTeacherIds(lesson.groupId, today);
    const teachers = await this.prisma.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { id: 'asc' },
    });
    const teacherNames = teachers.map((t) => `${t.firstName} ${t.lastName}`);

    let sent = 0;
    for (const { student } of attendees) {
      const chatId = student.telegramChatId;
      if (!chatId) continue;
      let ratingId: string;
      try {
        const row = await this.prisma.lessonRating.create({
          data: {
            companyId: lesson.companyId,
            branchId: lesson.branchId,
            groupId: lesson.groupId,
            studentId: student.id,
            date: today,
            teacherIds,
            chatId,
          },
          select: { id: true },
        });
        ratingId = row.id;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue; // boshqa instans olgan
        }
        throw err;
      }

      const outcome = await sendTelegramText(
        bot,
        chatId,
        ratingQuestion({
          studentFirstName: student.firstName,
          groupName: lesson.groupName,
          teacherNames,
        }),
        { parse_mode: 'HTML', reply_markup: ratingKeyboard(ratingId) },
      );
      if (outcome.ok) {
        await this.prisma.lessonRating.update({
          where: { id: ratingId },
          data: { messageId: outcome.messageId },
        });
        sent += 1;
      } else {
        await this.prisma.lessonRating.update({
          where: { id: ratingId },
          data: {
            status: LessonRatingStatus.FAILED,
            failReason: `${outcome.kind}: ${outcome.description}`,
          },
        });
      }
    }
    return sent;
  }

  /** Shu kungi o'rinbosar bo'lsa — uning ustozlari, aks holda guruh ustozlari. */
  private async lessonTeacherIds(groupId: string, date: Date): Promise<number[]> {
    const override = await this.prisma.lessonTeacherOverride.findFirst({
      where: { groupId, date, deletedAt: null },
      select: { teacherIds: true },
    });
    if (override) return override.teacherIds;
    const rows = await this.prisma.groupTeacher.findMany({
      where: { groupId },
      select: { teacherId: true },
    });
    return rows.map((r) => r.teacherId);
  }
}
```

Eslatma: `SendOutcome`ning muvaffaqiyatsiz shaklida `description` maydoni bor (`telegram-send.ts:114-140`). Agar `describeError` yoki tip nomlari farq qilsa, `telegram-send.ts`dagi eksportga moslang.

- [ ] **Step 4: Modul** — `server/src/lesson-ratings/lesson-ratings.module.ts`

```ts
import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { SettingsModule } from '../settings/settings.module';
import { LessonRatingSenderService } from './lesson-rating-sender.service';

/** Dars baholari (spec 2026-10-13). TelegramModule'ga bir tomonlama bog'liq. */
@Module({
  imports: [TelegramModule, HolidaysModule, SettingsModule],
  providers: [LessonRatingSenderService],
})
export class LessonRatingsModule {}
```

`server/src/app.module.ts`: `import { LessonRatingsModule } from './lesson-ratings/lesson-ratings.module';` va `imports` massiviga `TasksModule,` qatoridan keyin `LessonRatingsModule,`.

- [ ] **Step 5: Testlar**

Run: `cd server && npx jest src/lesson-ratings src/telegram-digest/direct-send.guard.spec.ts && npm run typecheck`
Expected: PASS. (`direct-send.guard` o'zgarmaydi: servis `.sendMessage(`ni to'g'ridan chaqirmaydi, `sendTelegramText` orqali yuboradi.)

- [ ] **Step 6: Commit**

```bash
cd server && npx prettier --write src/lesson-ratings src/app.module.ts && npx eslint src/lesson-ratings
git add src/lesson-ratings src/app.module.ts
git commit -m "feat(lesson-ratings): dars tugagach kelgan o'quvchiga baho so'rovi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Bot — tugma va izoh

**Files:**
- Create: `server/src/lesson-ratings/lesson-rating-telegram.handler.ts`
- Create: `server/src/lesson-ratings/lesson-rating-telegram.handler.spec.ts`
- Modify: `server/src/lesson-ratings/lesson-ratings.module.ts` (provider)

**Interfaces:**
- Consumes: `parseRatingCallback`, `isWithinWindow`, `cleanComment`, `thanksText`, `LOW_SCORE_MAX`, matn konstantalari (Task 3); `TelegramService.getBot()`, `TelegramService.useBeforeScenes(mw)`.
- Produces: `LessonRatingTelegramHandler.onAction(ctx: BotContext, now?: Date): Promise<void>`, `LessonRatingTelegramHandler.onMessage(ctx: BotContext, next: () => Promise<void>, now?: Date): Promise<void>`.

- [ ] **Step 1: Failing test** — `server/src/lesson-ratings/lesson-rating-telegram.handler.spec.ts`

```ts
import { LessonRatingTelegramHandler } from './lesson-rating-telegram.handler';

const ID = '11111111-2222-3333-4444-555555555555';
const SENT = new Date('2026-10-12T05:20:00Z');
const NOW = new Date('2026-10-12T06:00:00Z');

function setup(row: Record<string, unknown> | null, updated = 1) {
  const prisma = {
    lessonRating: {
      findUnique: jest.fn().mockResolvedValue(row),
      findFirst: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: updated }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const handler = new LessonRatingTelegramHandler(prisma as never, {} as never);
  return { handler, prisma };
}

function actionCtx(data: string, chatId = 555) {
  return {
    chat: { id: chatId, type: 'private' },
    callbackQuery: { data },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({ message_id: 900 }),
  };
}

function replyCtx(text: string, replyTo: number, chatId = 555) {
  return {
    chat: { id: chatId, type: 'private' },
    message: { text, reply_to_message: { message_id: replyTo } },
    reply: jest.fn().mockResolvedValue({ message_id: 901 }),
  };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  chatId: '555',
  sentAt: SENT,
  score: null,
  comment: null,
  ...over,
});

describe('LessonRatingTelegramHandler — buttons', () => {
  it('saves a 5 once and thanks without asking why', async () => {
    const { handler, prisma } = setup(row());
    const ctx = actionCtx(`lr:${ID}:5`);
    await handler.onAction(ctx as never, NOW);
    expect(prisma.lessonRating.updateMany).toHaveBeenCalledWith({
      where: { id: ID, score: null },
      data: { score: 5, ratedAt: NOW },
    });
    expect(ctx.editMessageText).toHaveBeenCalledWith("Rahmat! Siz 5 ⭐ qo'ydingiz.");
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('asks why after a 2 and remembers the prompt', async () => {
    const { handler, prisma } = setup(row());
    const ctx = actionCtx(`lr:${ID}:2`);
    await handler.onAction(ctx as never, NOW);
    expect(ctx.reply).toHaveBeenCalledWith(
      "Nima yoqmadi? Shu xabarga javob qilib yozing (ixtiyoriy).",
      { reply_markup: { force_reply: true } },
    );
    expect(prisma.lessonRating.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { promptMessageId: 900 },
    });
  });

  it("refuses another chat's button", async () => {
    const { handler, prisma } = setup(row());
    const ctx = actionCtx(`lr:${ID}:4`, 999);
    await handler.onAction(ctx as never, NOW);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("Bu so'rov sizga emas");
    expect(prisma.lessonRating.updateMany).not.toHaveBeenCalled();
  });

  it('refuses after 48 hours and takes the buttons away', async () => {
    const { handler, prisma } = setup(row({ sentAt: new Date('2026-10-09T00:00:00Z') }));
    const ctx = actionCtx(`lr:${ID}:4`);
    await handler.onAction(ctx as never, NOW);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("Baho berish muddati o'tgan");
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(prisma.lessonRating.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the first score on a second press', async () => {
    const { handler } = setup(row(), 0);
    const ctx = actionCtx(`lr:${ID}:1`);
    await handler.onAction(ctx as never, NOW);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Siz allaqachon baho bergansiz');
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe('LessonRatingTelegramHandler — comment', () => {
  it('saves a reply to the prompt as the comment', async () => {
    const { handler, prisma } = setup(row({ score: 2 }));
    const ctx = replyCtx('  Ustoz kech qoldi ', 900);
    const next = jest.fn();
    await handler.onMessage(ctx as never, next, NOW);
    expect(prisma.lessonRating.findFirst).toHaveBeenCalledWith({
      where: { chatId: '555', promptMessageId: 900 },
      select: { id: true, sentAt: true, comment: true },
    });
    expect(prisma.lessonRating.updateMany).toHaveBeenCalledWith({
      where: { id: ID, comment: null },
      data: { comment: 'Ustoz kech qoldi', commentedAt: NOW },
    });
    expect(ctx.reply).toHaveBeenCalledWith('Rahmat, fikringiz yetkazildi.');
    expect(next).not.toHaveBeenCalled();
  });

  it('passes on a reply that is not to a prompt', async () => {
    const { handler } = setup(null);
    const next = jest.fn();
    await handler.onMessage(replyCtx('salom', 123) as never, next, NOW);
    expect(next).toHaveBeenCalled();
  });

  it('passes on a command', async () => {
    const { handler, prisma } = setup(row());
    const next = jest.fn();
    await handler.onMessage(replyCtx('/start', 900) as never, next, NOW);
    expect(next).toHaveBeenCalled();
    expect(prisma.lessonRating.findFirst).not.toHaveBeenCalled();
  });

  it('keeps the first comment', async () => {
    const { handler } = setup(row({ comment: 'birinchi' }));
    const ctx = replyCtx('ikkinchi', 900);
    await handler.onMessage(ctx as never, jest.fn(), NOW);
    expect(ctx.reply).toHaveBeenCalledWith('Fikringiz allaqachon yozilgan.');
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/lesson-ratings/lesson-rating-telegram.handler.spec.ts`
Expected: FAIL — modul topilmaydi

- [ ] **Step 3: Handler** — `server/src/lesson-ratings/lesson-rating-telegram.handler.ts`

```ts
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Composer } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import type { BotContext } from '../telegram/types/context';
import { describeError } from '../telegram-digest/telegram-send';
import {
  ALREADY_RATED,
  ASK_COMMENT,
  COMMENT_ALREADY,
  COMMENT_SAVED,
  EXPIRED,
  LOW_SCORE_MAX,
  NOT_YOURS,
  TRY_LATER,
  cleanComment,
  isWithinWindow,
  parseRatingCallback,
  thanksText,
} from './rating-rules';

/**
 * Baho tugmasi va «Nima yoqmadi?» javobi (spec 2026-10-13 §5.2–5.3). Sahnalardan
 * oldin ishlaydi (`useBeforeScenes`, ADR-0078 bilan bir yo'l): ochiq scene bosishni
 * yutmaydi; o'zimizniki bo'lmagan hamma narsa `next()`ga o'tadi.
 */
@Injectable()
export class LessonRatingTelegramHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(LessonRatingTelegramHandler.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.telegram.getBot()) return; // TELEGRAM_BOT_TOKEN yo'q — bot o'chiq
    const c = new Composer<BotContext>();
    c.action(/^lr:/, (ctx) => this.onAction(ctx));
    c.on('message', (ctx, next) => this.onMessage(ctx, next));
    this.telegram.useBeforeScenes(c);
  }

  async onAction(ctx: BotContext, now: Date = new Date()): Promise<void> {
    try {
      await this.handleAction(ctx, now);
    } catch (err) {
      this.logger.error(`rating button failed: ${describeError(err)}`);
      await ctx.answerCbQuery(TRY_LATER).catch(() => undefined);
    }
  }

  private async handleAction(ctx: BotContext, now: Date): Promise<void> {
    const q = ctx.callbackQuery;
    const cmd = parseRatingCallback(q && 'data' in q ? q.data : '');
    if (!cmd || ctx.chat?.type !== 'private') {
      await ctx.answerCbQuery();
      return;
    }
    const row = await this.prisma.lessonRating.findUnique({
      where: { id: cmd.ratingId },
      select: { id: true, chatId: true, sentAt: true },
    });
    if (!row || row.chatId !== String(ctx.chat.id)) {
      await ctx.answerCbQuery(NOT_YOURS);
      return;
    }
    if (!isWithinWindow(row.sentAt, now)) {
      await ctx.answerCbQuery(EXPIRED);
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }
    const { count } = await this.prisma.lessonRating.updateMany({
      where: { id: row.id, score: null },
      data: { score: cmd.score, ratedAt: now },
    });
    if (count === 0) {
      await ctx.answerCbQuery(ALREADY_RATED);
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }
    await ctx.answerCbQuery();
    await ctx.editMessageText(thanksText(cmd.score)).catch(() => undefined);
    if (cmd.score <= LOW_SCORE_MAX) {
      const prompt = await ctx.reply(ASK_COMMENT, {
        reply_markup: { force_reply: true },
      });
      await this.prisma.lessonRating.update({
        where: { id: row.id },
        data: { promptMessageId: prompt.message_id },
      });
    }
  }

  async onMessage(
    ctx: BotContext,
    next: () => Promise<void>,
    now: Date = new Date(),
  ): Promise<void> {
    let ours: boolean;
    try {
      ours = await this.handleReply(ctx, now);
    } catch (err) {
      this.logger.error(`rating comment failed: ${describeError(err)}`);
      await ctx.reply(TRY_LATER).catch(() => undefined);
      return;
    }
    if (!ours) return next();
  }

  /** Baho so'roviga javob bo'lsa — true (javob berildi). */
  private async handleReply(ctx: BotContext, now: Date): Promise<boolean> {
    const msg = ctx.message;
    if (!msg || ctx.chat?.type !== 'private') return false;
    if (!('text' in msg) || !('reply_to_message' in msg) || !msg.reply_to_message) {
      return false;
    }
    if (msg.text.startsWith('/')) return false;

    const row = await this.prisma.lessonRating.findFirst({
      where: {
        chatId: String(ctx.chat.id),
        promptMessageId: msg.reply_to_message.message_id,
      },
      select: { id: true, sentAt: true, comment: true },
    });
    if (!row) return false;
    if (!isWithinWindow(row.sentAt, now)) {
      await ctx.reply(EXPIRED);
      return true;
    }
    if (row.comment !== null) {
      await ctx.reply(COMMENT_ALREADY);
      return true;
    }
    const comment = cleanComment(msg.text);
    if (!comment) return true;
    const { count } = await this.prisma.lessonRating.updateMany({
      where: { id: row.id, comment: null },
      data: { comment, commentedAt: now },
    });
    await ctx.reply(count ? COMMENT_SAVED : COMMENT_ALREADY);
    return true;
  }
}
```

Testdagi birinchi holatda `findUnique` `select`ida `score` yo'q — bu to'g'ri: takror bosish `updateMany` sharti bilan aniqlanadi.

`lesson-ratings.module.ts` `providers`ga `LessonRatingTelegramHandler` qo'shing (import bilan).

- [ ] **Step 4: Testlar**

Run: `cd server && npx jest src/lesson-ratings && npm run typecheck`
Expected: PASS. Typecheck `ctx.message` / `ctx.editMessageReplyMarkup` tiplari bo'yicha xato bersa, `task-telegram-replies.ts:64-90` dagi naqshga moslang (o'sha fayl xuddi shu tiplar bilan ishlaydi).

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/lesson-ratings && npx eslint src/lesson-ratings
git add src/lesson-ratings
git commit -m "feat(lesson-ratings): bot tugmasi va «Nima yoqmadi?» izohi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hisobot servisi va CEO endpointlari

**Files:**
- Create: `server/src/lesson-ratings/dto/rating-query.dto.ts`
- Create: `server/src/lesson-ratings/lesson-ratings.service.ts`
- Create: `server/src/lesson-ratings/lesson-ratings.service.spec.ts`
- Create: `server/src/lesson-ratings/lesson-ratings.controller.ts`
- Create: `server/src/lesson-ratings/lesson-ratings.controller.spec.ts`
- Modify: `server/src/lesson-ratings/lesson-ratings.module.ts` (controller + service)
- Modify: `server/src/common/permissions/route-access.snapshot.json` (4 ta route)
- Modify: `server/src/common/auth/branch-route-policy.ts` (PATCH route — `COMPANY_WIDE`)

**Interfaces:**
- Consumes: `totalsOf`, `byTeacher`, `sortByAverage`, `RatingTotals` (Task 3); `LOW_SCORE_MAX`; `SettingsService.get/set`; `branchIdWhere(scope)`, `ReportBranchIds` (`common/finance/report-branch-scope`); `tashkentMonthKey`, `addMonthsToMonthKey`, `utcMidnightFromDateStr` (`common/date/tashkent`).
- Produces (HTTP, hammasi `@CeoOnly()`):
  - `GET /lesson-ratings/summary?month=` → `RatingSummary = { enabled: boolean; month: string; totals: RatingTotals; previousAverage: number | null; teachers: { teacherId: number; name: string; previousAverage: number | null; average; rated; delivered; responseRate; low }[] }`
  - `GET /lesson-ratings/teachers/:id?month=` → `TeacherRatings = { teacher: { id: number; name: string }; months: { month: string; average: number | null; rated: number }[]; groups: { groupId: string; name: string; average: number | null; rated: number }[]; comments: { date: string; groupName: string; studentId: number; studentName: string; score: number; comment: string }[] }`
  - `GET /lesson-ratings/low?month=&page=&pageSize=` → `{ data: LowRating[]; total; page; pageSize }`, `LowRating = { id: string; date: string; groupId: string; groupName: string; teacherNames: string[]; studentId: number; studentName: string; score: number; comment: string | null }`
  - `PATCH /lesson-ratings/settings` body `{ enabled: boolean }` → `{ enabled: boolean }`

- [ ] **Step 1: DTO** — `server/src/lesson-ratings/dto/rating-query.dto.ts`

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class RatingMonthDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "month 'YYYY-MM' ko'rinishida bo'lishi kerak",
  })
  month?: string;
}

export class RatingLowQueryDto extends RatingMonthDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 10;
}

export class RatingSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
```

- [ ] **Step 2: Failing servis testi** — `server/src/lesson-ratings/lesson-ratings.service.spec.ts`

```ts
import { NotFoundException } from '@nestjs/common';
import { LessonRatingsService } from './lesson-ratings.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function setup(rows: Record<string, unknown>[] = []) {
  const prisma = {
    lessonRating: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
    user: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
        where.id.in.map((id) => ({ id, firstName: 'U', lastName: String(id) })),
      ),
      findFirst: jest.fn().mockResolvedValue({ id: 7, firstName: 'Anna', lastName: 'S' }),
    },
  };
  const settings = { get: jest.fn().mockResolvedValue(true), set: jest.fn().mockResolvedValue(false) };
  return { service: new LessonRatingsService(prisma as never, settings as never), prisma, settings };
}

describe('LessonRatingsService.summary', () => {
  it('reads the month and the one before inside the branch scope', async () => {
    const { service, prisma } = setup();
    await service.summary(1, [7], '2026-11');
    const wheres = prisma.lessonRating.findMany.mock.calls.map((c) => c[0].where);
    expect(wheres).toContainEqual({
      companyId: 1,
      date: { gte: d('2026-11-01'), lt: d('2026-12-01') },
      branchId: { in: [7] },
    });
    expect(wheres).toContainEqual({
      companyId: 1,
      date: { gte: d('2026-10-01'), lt: d('2026-11-01') },
      branchId: { in: [7] },
    });
  });

  it('lists teachers lowest average first with their names', async () => {
    const { service } = setup([
      { score: 5, messageId: 1, teacherIds: [1] },
      { score: 2, messageId: 2, teacherIds: [2] },
    ]);
    const r = await service.summary(1, null, '2026-10');
    expect(r.enabled).toBe(true);
    expect(r.teachers.map((t) => t.teacherId)).toEqual([2, 1]);
    expect(r.teachers[0]).toMatchObject({ name: 'U 2', average: 2, low: 1 });
  });
});

describe('LessonRatingsService.teacher', () => {
  it('answers 404 for an unknown teacher', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.teacher(1, null, 99, '2026-10')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('gives six months, the month by group and its comments', async () => {
    const { service, prisma } = setup([
      {
        date: d('2026-10-05'),
        score: 2,
        messageId: 1,
        comment: 'kech',
        groupId: 'g1',
        studentId: 10001,
        teacherIds: [7],
        group: { name: 'A1-3' },
        student: { firstName: 'Ali', lastName: 'V' },
      },
      {
        date: d('2026-09-10'),
        score: 5,
        messageId: 2,
        comment: null,
        groupId: 'g1',
        studentId: 10002,
        teacherIds: [7],
        group: { name: 'A1-3' },
        student: { firstName: 'Bek', lastName: 'Q' },
      },
    ]);
    const r = await service.teacher(1, null, 7, '2026-10');
    expect(prisma.lessonRating.findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 1,
      teacherIds: { has: 7 },
      date: { gte: d('2026-05-01'), lt: d('2026-11-01') },
    });
    expect(r.months.map((m) => m.month)).toEqual([
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
    expect(r.months[4]).toEqual({ month: '2026-09', average: 5, rated: 1 });
    expect(r.groups).toEqual([{ groupId: 'g1', name: 'A1-3', average: 2, rated: 1 }]);
    expect(r.comments).toEqual([
      { date: '2026-10-05', groupName: 'A1-3', studentId: 10001, studentName: 'Ali V', score: 2, comment: 'kech' },
    ]);
  });
});

describe('LessonRatingsService.low', () => {
  it('pages the 1–3 scores of the month, newest first', async () => {
    const { service, prisma } = setup([
      {
        id: 'r1',
        date: d('2026-10-05'),
        score: 1,
        comment: null,
        groupId: 'g1',
        studentId: 10001,
        teacherIds: [7],
        group: { name: 'A1-3' },
        student: { firstName: 'Ali', lastName: 'V' },
      },
    ]);
    const r = await service.low(1, null, '2026-10', 2, 20);
    const args = prisma.lessonRating.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      companyId: 1,
      date: { gte: d('2026-10-01'), lt: d('2026-11-01') },
      score: { lte: 3 },
    });
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
    expect(r).toMatchObject({ total: 1, page: 2, pageSize: 20 });
    expect(r.data[0]).toMatchObject({ id: 'r1', date: '2026-10-05', teacherNames: ['U 7'], studentName: 'Ali V' });
  });
});

describe('LessonRatingsService.setEnabled', () => {
  it('writes the company-level setting', async () => {
    const { service, settings } = setup();
    await expect(service.setEnabled(1, false, 10001)).resolves.toEqual({ enabled: false });
    expect(settings.set).toHaveBeenCalledWith(1, 'lessonRating.enabled', false, 10001);
  });
});
```

Run: `cd server && npx jest src/lesson-ratings/lesson-ratings.service.spec.ts`
Expected: FAIL — modul topilmaydi

- [ ] **Step 3: Servis** — `server/src/lesson-ratings/lesson-ratings.service.ts`

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { byTeacher, sortByAverage, totalsOf, type RatingRow } from './rating-math';
import { LOW_SCORE_MAX } from './rating-rules';

/** `@db.Date` ustuni uchun oy chegarasi: [1-kun, keyingi oyning 1-kuni). */
function monthDates(month: string): { gte: Date; lt: Date } {
  return {
    gte: utcMidnightFromDateStr(`${month}-01`),
    lt: utcMidnightFromDateStr(`${addMonthsToMonthKey(month, 1)}-01`),
  };
}

const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const nameOf = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

/** CEO'ning «Dars baholari» o'qishlari (spec 2026-10-13 §6.2). */
@Injectable()
export class LessonRatingsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async summary(companyId: number, scope: ReportBranchIds, month?: string) {
    const m = month ?? tashkentMonthKey(new Date());
    const [enabled, rows, prevRows] = await Promise.all([
      this.settings.get(companyId, 'lessonRating.enabled'),
      this.loadRows(companyId, scope, m),
      this.loadRows(companyId, scope, addMonthsToMonthKey(m, -1)),
    ]);
    const per = byTeacher(rows);
    const prevPer = byTeacher(prevRows);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...per.keys()] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const teachers = sortByAverage(
      users.map((u) => ({
        teacherId: u.id,
        name: nameOf(u),
        ...per.get(u.id)!,
        previousAverage: prevPer.get(u.id)?.average ?? null,
      })),
    );
    return {
      enabled,
      month: m,
      totals: totalsOf(rows),
      previousAverage: totalsOf(prevRows).average,
      teachers,
    };
  }

  async teacher(
    companyId: number,
    scope: ReportBranchIds,
    teacherId: number,
    month?: string,
  ) {
    const m = month ?? tashkentMonthKey(new Date());
    const from = addMonthsToMonthKey(m, -5);
    const teacher = await this.prisma.user.findFirst({
      where: { id: teacherId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) throw new NotFoundException('Ustoz topilmadi');

    const rows = await this.prisma.lessonRating.findMany({
      where: {
        companyId,
        teacherIds: { has: teacherId },
        date: { gte: monthDates(from).gte, lt: monthDates(m).lt },
        ...branchIdWhere(scope),
      },
      orderBy: { date: 'desc' },
      select: {
        date: true,
        score: true,
        messageId: true,
        comment: true,
        groupId: true,
        studentId: true,
        teacherIds: true,
        group: { select: { name: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    });
    const asRow = (r: (typeof rows)[number]): RatingRow => ({
      score: r.score,
      delivered: r.messageId !== null,
      teacherIds: r.teacherIds,
    });

    const months = [];
    for (let k = from; k <= m; k = addMonthsToMonthKey(k, 1)) {
      const t = totalsOf(rows.filter((r) => dayStr(r.date).startsWith(k)).map(asRow));
      months.push({ month: k, average: t.average, rated: t.rated });
    }

    const current = rows.filter((r) => dayStr(r.date).startsWith(m));
    const byGroup = new Map<string, typeof current>();
    for (const r of current) {
      byGroup.set(r.groupId, [...(byGroup.get(r.groupId) ?? []), r]);
    }
    const groups = sortByAverage(
      [...byGroup].map(([groupId, list]) => {
        const t = totalsOf(list.map(asRow));
        return { groupId, name: list[0].group.name, average: t.average, rated: t.rated };
      }),
    );

    const comments = current
      .filter((r) => r.comment !== null && r.score !== null)
      .map((r) => ({
        date: dayStr(r.date),
        groupName: r.group.name,
        studentId: r.studentId,
        studentName: nameOf(r.student),
        score: r.score!,
        comment: r.comment!,
      }));

    return { teacher: { id: teacher.id, name: nameOf(teacher) }, months, groups, comments };
  }

  async low(
    companyId: number,
    scope: ReportBranchIds,
    month: string | undefined,
    page: number,
    pageSize: number,
  ) {
    const m = month ?? tashkentMonthKey(new Date());
    const where = {
      companyId,
      date: monthDates(m),
      score: { lte: LOW_SCORE_MAX },
      ...branchIdWhere(scope),
    };
    const [total, rows] = await Promise.all([
      this.prisma.lessonRating.count({ where }),
      this.prisma.lessonRating.findMany({
        where,
        orderBy: [{ date: 'desc' }, { ratedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          date: true,
          score: true,
          comment: true,
          groupId: true,
          studentId: true,
          teacherIds: true,
          group: { select: { name: true } },
          student: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    const teacherIds = [...new Set(rows.flatMap((r) => r.teacherIds))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const names = new Map(users.map((u) => [u.id, nameOf(u)]));
    return {
      data: rows.map((r) => ({
        id: r.id,
        date: dayStr(r.date),
        groupId: r.groupId,
        groupName: r.group.name,
        teacherNames: r.teacherIds.map((id) => names.get(id)).filter((n): n is string => !!n),
        studentId: r.studentId,
        studentName: nameOf(r.student),
        score: r.score!,
        comment: r.comment,
      })),
      total,
      page,
      pageSize,
    };
  }

  async setEnabled(companyId: number, enabled: boolean, userId: number) {
    const value = await this.settings.set(companyId, 'lessonRating.enabled', enabled, userId);
    return { enabled: value };
  }

  private async loadRows(
    companyId: number,
    scope: ReportBranchIds,
    month: string,
  ): Promise<RatingRow[]> {
    const rows = await this.prisma.lessonRating.findMany({
      where: { companyId, date: monthDates(month), ...branchIdWhere(scope) },
      select: { score: true, messageId: true, teacherIds: true },
    });
    return rows.map((r) => ({
      score: r.score,
      delivered: r.messageId !== null,
      teacherIds: r.teacherIds,
    }));
  }
}
```

Run: `cd server && npx jest src/lesson-ratings/lesson-ratings.service.spec.ts`
Expected: PASS

- [ ] **Step 4: Controller va uning testi**

`server/src/lesson-ratings/lesson-ratings.controller.spec.ts`

```ts
import { routeAccess } from '../common/permissions/testing';
import { LessonRatingsController } from './lesson-ratings.controller';

describe('LessonRatingsController access', () => {
  it.each(['summary', 'teacher', 'low', 'setEnabled'])(
    '%s is CEO-only by identity',
    (name) => {
      expect(routeAccess(LessonRatingsController, name)).toEqual({ kind: 'ceo' });
    },
  );
});
```

`server/src/lesson-ratings/lesson-ratings.controller.ts`

```ts
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { CeoOnly } from '../common/permissions/access.decorators';
import { RatingLowQueryDto, RatingMonthDto, RatingSettingsDto } from './dto/rating-query.dto';
import { LessonRatingsService } from './lesson-ratings.service';

/**
 * «Dars baholari» (spec 2026-10-13 §6). Faqat CEO — kimlik, imkoniyat emas
 * (`@CeoOnly()`, ADR-0087): baholarni hech kimga berib bo'lmaydi.
 * Marker har handler'da: handler darajasidagi marker klassnikini bosadi.
 */
@Controller('lesson-ratings')
export class LessonRatingsController {
  constructor(private readonly ratings: LessonRatingsService) {}

  @Get('summary')
  @CeoOnly()
  summary(
    @Query() q: RatingMonthDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ratings.summary(companyId, scope, q.month);
  }

  @Get('teachers/:id')
  @CeoOnly()
  teacher(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: RatingMonthDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ratings.teacher(companyId, scope, id, q.month);
  }

  @Get('low')
  @CeoOnly()
  low(
    @Query() q: RatingLowQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ratings.low(companyId, scope, q.month, q.page ?? 1, q.pageSize ?? 10);
  }

  @Patch('settings')
  @CeoOnly()
  setEnabled(
    @Body() dto: RatingSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.ratings.setEnabled(companyId, dto.enabled, userId);
  }
}
```

`lesson-ratings.module.ts`: `controllers: [LessonRatingsController]`, `providers`ga `LessonRatingsService`.

- [ ] **Step 5: Route manifestlari**

`server/src/common/permissions/route-access.snapshot.json` — alifbo tartibidagi o'rinlariga:

```json
  "GET /lesson-ratings/low": [
    "CEO"
  ],
  "GET /lesson-ratings/summary": [
    "CEO"
  ],
  "GET /lesson-ratings/teachers/:id": [
    "CEO"
  ],
```

va `PATCH` bloklari orasiga:

```json
  "PATCH /lesson-ratings/settings": [
    "CEO"
  ],
```

`server/src/common/auth/branch-route-policy.ts` — «Ruxsatlar» `COMPANY_WIDE` yozuvidan (154-qator atrofi) keyin:

```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      '«Dars baholari» switch (spec 2026-10-13 §6.1): `lessonRating.enabled` is a ' +
      'company-level setting (`companyLevelOnly`) — one value for every branch. ' +
      'CEO-only through `@CeoOnly()`. The three reads take `@BranchScope()`.',
    routes: ['PATCH /lesson-ratings/settings'],
  },
```

- [ ] **Step 6: Barcha tegishli testlar**

Run: `cd server && npx jest src/lesson-ratings src/common/permissions src/common/auth/branch-route-policy.spec.ts && npm run typecheck`
Expected: PASS. Agar `permission-routes.spec.ts` yoki `route-inventory.spec.ts` boshqa joy talab qilsa (masalan, `intentional-access-changes.ts`), xato matnidagi ko'rsatmaga amal qiling — yangi route'ning standart kirishi `["CEO"]`, o'zgarish yo'q.

- [ ] **Step 7: Commit**

```bash
cd server && npx prettier --write src/lesson-ratings src/common/auth/branch-route-policy.ts && npx eslint src/lesson-ratings src/common/auth/branch-route-policy.ts
git add src/lesson-ratings src/common/permissions/route-access.snapshot.json src/common/auth/branch-route-policy.ts
git commit -m "feat(lesson-ratings): CEO hisoboti — o'rtacha, ustozlar, past baholar, yoqish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Klient — hisobot menyusi va «Dars baholari» sahifasi

**Files:**
- Modify: `client/src/lib/reports-nav.ts` (`forRoles`, yangi element, `roleIds` parametri)
- Modify: `client/src/lib/reports-nav.test.ts`
- Modify: `client/src/components/reports/reports-layout-shell.tsx:15-21`
- Modify: `client/src/components/reports/reports-mobile-menu.tsx:9-21`
- Modify: `client/src/lib/breadcrumb-routes.ts` (`"dars-baholari": "Dars baholari"`)
- Create: `client/src/app/(dashboard)/reports/dars-baholari/page.tsx`
- Create: `client/src/components/reports/lesson-ratings/types.ts`
- Create: `client/src/components/reports/lesson-ratings/rating-format.ts`
- Create: `client/src/components/reports/lesson-ratings/rating-format.test.ts`
- Create: `client/src/components/reports/lesson-ratings/queries.ts`
- Create: `client/src/components/reports/lesson-ratings/teacher-ratings-panel.tsx`
- Create: `client/src/components/reports/lesson-ratings/rating-teachers-table.tsx`
- Create: `client/src/components/reports/lesson-ratings/rating-low-list.tsx`
- Create: `client/src/components/reports/lesson-ratings/lesson-ratings-client.tsx`

**Interfaces:**
- Consumes: Task 6 HTTP javoblari (`RatingSummary`, `TeacherRatings`, `LowRating`).
- Produces: `canEnterReports(can: Can, roleIds: readonly number[]): boolean`, `canOpenReportPath(can: Can, pathname: string, roleIds: readonly number[]): boolean`; `TeacherRatingsPanel({ teacherId: number; month: string })` (Task 8 ishlatadi); `useTeacherRatings(teacherId: number, month: string)`; `RATING_FLOOR_MONTH = "2026-10"`.

- [ ] **Step 1: Failing testlar**

`client/src/lib/reports-nav.test.ts` — mavjud `canEnterReports(...)` / `canOpenReportPath(...)` chaqiruvlariga oxirgi argument qo'shing: rol testlarida `[role]`, `canForRoles([3])` bilan chaqirilganda `[3]`. Va yangi blok:

```ts
describe("Dars baholari — faqat CEO", () => {
  it("opens for the CEO and nobody else", () => {
    expect(canOpenReportPath(canForRoles([1]), "/reports/dars-baholari", [1])).toBe(true);
    for (const role of [2, 3, 4, 5]) {
      expect(canOpenReportPath(canForRoles([role]), "/reports/dars-baholari", [role])).toBe(false);
    }
  });
});
```

`client/src/components/reports/lesson-ratings/rating-format.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { averageText, responseText, trend } from "./rating-format";

describe("averageText", () => {
  it("shows one decimal with a star, or a dash", () => {
    expect(averageText(4.6)).toBe("4,6 ⭐");
    expect(averageText(5)).toBe("5,0 ⭐");
    expect(averageText(null)).toBe("—");
  });
});

describe("trend", () => {
  it("compares with last month", () => {
    expect(trend(4.6, 4.4)).toEqual({ text: "↑ 0,2", tone: "up" });
    expect(trend(4.1, 4.4)).toEqual({ text: "↓ 0,3", tone: "down" });
    expect(trend(4.4, 4.4)).toEqual({ text: "o'zgarmadi", tone: "same" });
    expect(trend(4.4, null)).toBeNull();
    expect(trend(null, 4.4)).toBeNull();
  });
});

describe("responseText", () => {
  it("says rated of delivered with the share", () => {
    expect(responseText(255, 340, 75)).toBe("255 / 340 · 75%");
    expect(responseText(0, 0, null)).toBe("—");
  });
});
```

Run: `cd client && npx vitest --config vitest.config.ts run src/lib/reports-nav.test.ts src/components/reports/lesson-ratings`
Expected: FAIL

- [ ] **Step 2: `reports-nav.ts`**

`ReportsNavItem`ga qo'shing:

```ts
  /** Identity gate (role ids), like `nav-items.ts`. «Dars baholari» is the CEO's alone (spec 2026-10-13). */
  forRoles?: number[];
```

Importlarga `Star` (lucide). «O'quvchilar hisoboti» bo'limi `items` oxiriga:

```ts
      { title: "Dars baholari", url: "/reports/dars-baholari", icon: Star, forRoles: [1] },
```

Funksiyalarni almashtiring:

```ts
function itemVisible(item: ReportsNavItem, can: Can, roleIds: readonly number[]): boolean {
  if (item.permission && !can(item.permission)) return false;
  if (item.forRoles && !item.forRoles.some((id) => roleIds.includes(id))) return false;
  return true;
}

/** May the user enter the reports section at all — at least one report shows. */
export function canEnterReports(can: Can, roleIds: readonly number[]): boolean {
  return reportsNavSections.some((s) => s.items.some((i) => itemVisible(i, can, roleIds)));
}

export function canOpenReportPath(can: Can, pathname: string, roleIds: readonly number[]): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/reports") return canEnterReports(can, roleIds);
  const item = reportsNavSections
    .flatMap((s) => s.items)
    .find((i) => path === i.url || path.startsWith(`${i.url}/`));
  if (!item) return can("reports.finance");
  return itemVisible(item, can, roleIds);
}
```

`export { itemVisible as reportItemVisible };` qo'shing (mobil menyu uchun).

- [ ] **Step 3: Chaqiruvchilar**

`reports-layout-shell.tsx`: `const roleIds = user?.roles.map((r) => r.id) ?? [];` va `canOpenReportPath(can, pathname, roleIds)`.

`reports-mobile-menu.tsx`: `useAuth` import; `const roleIds = useAuth((s) => s.user?.roles.map((r) => r.id) ?? []);` — selector har renderda yangi massiv qaytarmasligi uchun `const user = useAuth((s) => s.user); const roleIds = user?.roles.map((r) => r.id) ?? [];`. Filtr: `section.items.filter((item) => reportItemVisible(item, can, roleIds))`.

`app-sidebar.tsx` o'zgarmaydi: `reportsChildren` `forRoles`ni `isNavGateOpen` orqali allaqachon hisobga oladi (`NavItemChild.forRoles`). Tekshiring: `grep -n "isNavGateOpen" src/components/app-sidebar.tsx`.

`breadcrumb-routes.ts`ga: `"dars-baholari": "Dars baholari",`.

- [ ] **Step 4: Tiplar va formatlash**

`client/src/components/reports/lesson-ratings/types.ts`

```ts
export interface RatingTotals {
  average: number | null;
  rated: number;
  delivered: number;
  responseRate: number | null;
  low: number;
}

export interface RatingTeacherRow extends RatingTotals {
  teacherId: number;
  name: string;
  previousAverage: number | null;
}

export interface RatingSummary {
  enabled: boolean;
  month: string;
  totals: RatingTotals;
  previousAverage: number | null;
  teachers: RatingTeacherRow[];
}

export interface TeacherRatings {
  teacher: { id: number; name: string };
  months: { month: string; average: number | null; rated: number }[];
  groups: { groupId: string; name: string; average: number | null; rated: number }[];
  comments: {
    date: string;
    groupName: string;
    studentId: number;
    studentName: string;
    score: number;
    comment: string;
  }[];
}

export interface LowRating {
  id: string;
  date: string;
  groupId: string;
  groupName: string;
  teacherNames: string[];
  studentId: number;
  studentName: string;
  score: number;
  comment: string | null;
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

`client/src/components/reports/lesson-ratings/rating-format.ts`

```ts
/** Baholar shu oydan beri yig'iladi (spec 2026-10-13). */
export const RATING_FLOOR_MONTH = "2026-10";

const oneDecimal = (x: number) => x.toFixed(1).replace(".", ",");

export function averageText(average: number | null): string {
  return average === null ? "—" : `${oneDecimal(average)} ⭐`;
}

export function trend(
  current: number | null,
  previous: number | null,
): { text: string; tone: "up" | "down" | "same" } | null {
  if (current === null || previous === null) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return { text: "o'zgarmadi", tone: "same" };
  return diff > 0
    ? { text: `↑ ${oneDecimal(diff)}`, tone: "up" }
    : { text: `↓ ${oneDecimal(-diff)}`, tone: "down" };
}

export function responseText(rated: number, delivered: number, rate: number | null): string {
  return rate === null ? "—" : `${rated} / ${delivered} · ${rate}%`;
}

/** "2026-10-05" → "05.10.2026". */
export function dayText(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}
```

Run: `cd client && npx vitest --config vitest.config.ts run src/lib/reports-nav.test.ts src/components/reports/lesson-ratings`
Expected: PASS

- [ ] **Step 5: So'rovlar** — `client/src/components/reports/lesson-ratings/queries.ts`

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import type { LowRating, Paged, RatingSummary, TeacherRatings } from "./types";

// The branch rides in the header (api.ts); it is in the keys so a switch refetches.
export function useRatingSummary(month: string) {
  const { selectedBranch } = useBranchSwitcher();
  return useQuery({
    queryKey: ["lesson-ratings", "summary", selectedBranch?.id, month],
    queryFn: () =>
      api.get<RatingSummary>("/lesson-ratings/summary", { params: { month } }).then((r) => r.data),
    staleTime: 0,
  });
}

export function useTeacherRatings(teacherId: number | null, month: string) {
  const { selectedBranch } = useBranchSwitcher();
  return useQuery({
    queryKey: ["lesson-ratings", "teacher", selectedBranch?.id, teacherId, month],
    queryFn: () =>
      api
        .get<TeacherRatings>(`/lesson-ratings/teachers/${teacherId}`, { params: { month } })
        .then((r) => r.data),
    enabled: teacherId !== null,
    staleTime: 0,
  });
}

export function useLowRatings(month: string, page: number, pageSize: number) {
  const { selectedBranch } = useBranchSwitcher();
  return useQuery({
    queryKey: ["lesson-ratings", "low", selectedBranch?.id, month, page, pageSize],
    queryFn: () =>
      api
        .get<Paged<LowRating>>("/lesson-ratings/low", { params: { month, page, pageSize } })
        .then((r) => r.data),
    staleTime: 0,
  });
}

export function useSetRatingEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch<{ enabled: boolean }>("/lesson-ratings/settings", { enabled }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lesson-ratings", "summary"] }),
  });
}
```

- [ ] **Step 6: Ustoz paneli (drawer va profil tab'i uchun bitta)** — `teacher-ratings-panel.tsx`

```tsx
"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/payments/overview/block-state";
import { monthShort } from "@/components/payments/salary-utils";
import { useTeacherRatings } from "./queries";
import { averageText, dayText } from "./rating-format";

/** Bitta ustozning baholari: 6 oy, guruhlar, izohlar (spec §6.3–6.4). */
export function TeacherRatingsPanel({ teacherId, month }: { teacherId: number; month: string }) {
  const q = useTeacherRatings(teacherId, month);
  if (q.isPending) return <Skeleton className="h-48 w-full" />;
  if (q.isError) return <BlockError title="Baholar" onRetry={() => q.refetch()} />;
  const { months, groups, comments } = q.data;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-medium">Oylar bo&apos;yicha</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {months.map((m) => (
            <div key={m.month} className="rounded-md border p-2 text-center">
              <p className="text-xs text-muted-foreground">{monthShort(m.month)}</p>
              <p className="font-medium">{averageText(m.average)}</p>
              <p className="text-xs text-muted-foreground">{m.rated} ta baho</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Guruhlar bo&apos;yicha</h3>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu oyda baho yo&apos;q</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {groups.map((g) => (
              <li key={g.groupId} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link href={`/groups/${g.groupId}`} className="hover:underline">
                  {g.name}
                </Link>
                <span>
                  {averageText(g.average)} · {g.rated} ta
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Izohlar</h3>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu oyda izoh yozilmagan</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c, i) => (
              <li key={`${c.studentId}-${c.date}-${i}`} className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{dayText(c.date)}</span>
                  <span>{c.groupName}</span>
                  <Link href={`/students/profile/${c.studentId}`} className="hover:underline">
                    {c.studentName}
                  </Link>
                  <span>{c.score} ⭐</span>
                </div>
                <p>{c.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Ustozlar jadvali** — `rating-teachers-table.tsx`

```tsx
"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/forms/table-pagination";
import { cn } from "@/lib/utils";
import type { RatingTeacherRow } from "./types";
import { averageText, responseText, trend } from "./rating-format";

export function RatingTeachersTable({
  rows,
  onOpen,
}: {
  rows: RatingTeacherRow[];
  onOpen: (teacherId: number) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Bu oyda baho yo&apos;q — tizim yoqilganini va darslar o&apos;tganini tekshiring
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>Ustoz</TableHead>
            <TableHead>O&apos;rtacha</TableHead>
            <TableHead>Baholar</TableHead>
            <TableHead>Javob ulushi</TableHead>
            <TableHead>Past (1–3)</TableHead>
            <TableHead>O&apos;tgan oyga nisbatan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((r, i) => {
            const t = trend(r.average, r.previousAverage);
            return (
              <TableRow
                key={r.teacherId}
                className="cursor-pointer"
                tabIndex={0}
                onClick={() => onOpen(r.teacherId)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(r.teacherId)}
              >
                <TableCell className="border-r text-muted-foreground">
                  {(page - 1) * pageSize + i + 1}
                </TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{averageText(r.average)}</TableCell>
                <TableCell>{r.rated}</TableCell>
                <TableCell>{responseText(r.rated, r.delivered, r.responseRate)}</TableCell>
                <TableCell className={cn(r.low > 0 && "text-destructive")}>{r.low}</TableCell>
                <TableCell
                  className={cn(
                    t?.tone === "up" && "text-green-600",
                    t?.tone === "down" && "text-destructive",
                  )}
                >
                  {t?.text ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 8: Past baholar** — `rating-low-list.tsx`

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePagination } from "@/components/forms/table-pagination";
import { BlockError } from "@/components/payments/overview/block-state";
import { useLowRatings } from "./queries";
import { dayText } from "./rating-format";

export function RatingLowList({ month }: { month: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const q = useLowRatings(month, page, pageSize);

  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <BlockError title="Past baholar" onRetry={() => q.refetch()} />;
  if (q.data.total === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Bu oyda 1–3 baho yo&apos;q
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>Sana</TableHead>
            <TableHead>Guruh</TableHead>
            <TableHead>Ustoz</TableHead>
            <TableHead>O&apos;quvchi</TableHead>
            <TableHead>Baho</TableHead>
            <TableHead>Izoh</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.data.data.map((r, i) => (
            <TableRow key={r.id}>
              <TableCell className="border-r text-muted-foreground">
                {(page - 1) * pageSize + i + 1}
              </TableCell>
              <TableCell>{dayText(r.date)}</TableCell>
              <TableCell>
                <Link href={`/groups/${r.groupId}`} className="hover:underline">
                  {r.groupName}
                </Link>
              </TableCell>
              <TableCell>{r.teacherNames.join(", ") || "—"}</TableCell>
              <TableCell>
                <Link href={`/students/profile/${r.studentId}`} className="hover:underline">
                  {r.studentName}
                </Link>
              </TableCell>
              <TableCell className="text-destructive">{r.score} ⭐</TableCell>
              <TableCell className="max-w-xs whitespace-normal text-sm">{r.comment ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={q.data.total}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}
```

`RatingLowList`ni sahifada `key={month}` bilan render qiling — oy o'zgarsa sahifa 1 ga qaytadi.

- [ ] **Step 9: Sahifa** — `lesson-ratings-client.tsx`

```tsx
"use client";

import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MonthStepper } from "@/components/shared/month-stepper";
import { BlockError, BlockSkeleton } from "@/components/payments/overview/block-state";
import { clampMonth } from "@/components/payments/overview/overview-math";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { useRatingSummary, useSetRatingEnabled } from "./queries";
import { RATING_FLOOR_MONTH, averageText, responseText, trend } from "./rating-format";
import { RatingTeachersTable } from "./rating-teachers-table";
import { RatingLowList } from "./rating-low-list";
import { TeacherRatingsPanel } from "./teacher-ratings-panel";

const FILTERS = {
  month: { type: "string" as const, defaultValue: "" },
  ustoz: { type: "number" as const, defaultValue: 0 },
};

/** «Dars baholari» (spec 2026-10-13 §6.3). Faqat CEO. */
export function LessonRatingsClient() {
  const { filters, setFilter } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = clampMonth(filters.month || current, RATING_FLOOR_MONTH, current);
  const summary = useRatingSummary(month);
  const toggle = useSetRatingEnabled();
  const openTeacher = filters.ustoz || null;
  const openName = summary.data?.teachers.find((t) => t.teacherId === openTeacher)?.name;

  const onToggle = (enabled: boolean) =>
    toggle.mutate(enabled, {
      onSuccess: (r) =>
        toast.success(r.enabled ? "Baho so'rash yoqildi" : "Baho so'rash o'chirildi"),
      onError: (e) => toast.error(getErrorMessage(e, "Sozlamani saqlab bo'lmadi")),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Dars baholari</h2>
        <div className="flex flex-wrap items-center gap-4">
          {summary.data && (
            <div className="flex items-center gap-2">
              <Switch
                id="rating-enabled"
                checked={summary.data.enabled}
                disabled={toggle.isPending}
                onCheckedChange={onToggle}
              />
              <Label htmlFor="rating-enabled">
                Baho so&apos;rash: {summary.data.enabled ? "Yoqilgan" : "O'chirilgan"}
              </Label>
            </div>
          )}
          <MonthStepper
            value={month}
            min={RATING_FLOOR_MONTH}
            max={current}
            onChange={(m) => setFilter("month", m === current ? "" : m)}
          />
        </div>
      </div>

      {summary.isPending ? (
        <BlockSkeleton className="h-64" />
      ) : summary.isError ? (
        <BlockError title="Dars baholari" onRetry={() => summary.refetch()} />
      ) : (
        <>
          {!summary.data.enabled && (
            <p className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
              Hozir o&apos;quvchilardan baho so&apos;ralmayapti.
            </p>
          )}
          <SummaryCards data={summary.data} />
          <section className="space-y-3">
            <h3 className="font-medium">Ustozlar</h3>
            <RatingTeachersTable
              rows={summary.data.teachers}
              onOpen={(id) => setFilter("ustoz", id)}
            />
          </section>
          <section className="space-y-3">
            <h3 className="font-medium">Past baholar (1–3)</h3>
            <RatingLowList key={month} month={month} />
          </section>
        </>
      )}

      <Sheet open={openTeacher !== null} onOpenChange={(o) => !o && setFilter("ustoz", 0)}>
        <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{openName ?? "Ustoz baholari"}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {openTeacher !== null && <TeacherRatingsPanel teacherId={openTeacher} month={month} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCards({ data }: { data: NonNullable<ReturnType<typeof useRatingSummary>["data"]> }) {
  const t = trend(data.totals.average, data.previousAverage);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">O&apos;rtacha baho</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{averageText(data.totals.average)}</p>
          {t && (
            <p
              className={cn(
                "text-xs",
                t.tone === "up" && "text-green-600",
                t.tone === "down" && "text-destructive",
              )}
            >
              {t.text} — o&apos;tgan oyga nisbatan
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Javob berganlar</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            {responseText(data.totals.rated, data.totals.delivered, data.totals.responseRate)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Past baholar (1–3)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={cn("text-2xl font-semibold", data.totals.low > 0 && "text-destructive")}>
            {data.totals.low}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

`useUrlFilters` `"number"` turini qo'llashini tekshiring (`src/hooks/use-url-filters.ts`); `setFilter("ustoz", 0)` standart qiymat bo'lgani uchun URL'dan o'chadi.

`client/src/app/(dashboard)/reports/dars-baholari/page.tsx`

```tsx
import { Suspense } from "react";
import { LessonRatingsClient } from "@/components/reports/lesson-ratings/lesson-ratings-client";

export default function LessonRatingsPage() {
  // The month and the open teacher live in the URL (useSearchParams).
  return (
    <Suspense fallback={null}>
      <LessonRatingsClient />
    </Suspense>
  );
}
```

- [ ] **Step 10: Tekshirish**

Run: `cd client && npx vitest --config vitest.config.ts run src/lib src/components/reports && npx tsc --noEmit -p . && npx eslint src/lib/reports-nav.ts src/components/reports`
Expected: PASS, tip va lint xatosiz.

- [ ] **Step 11: Commit**

```bash
cd client && git add src/lib/reports-nav.ts src/lib/reports-nav.test.ts src/lib/breadcrumb-routes.ts src/components/reports "src/app/(dashboard)/reports/dars-baholari"
git commit -m "feat(client): «Dars baholari» hisoboti — faqat CEO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Klient — ustoz profilidagi «Baholar» tab'i

**Files:**
- Modify: `client/src/components/teachers/teacher-profile-tabs.tsx`

**Interfaces:**
- Consumes: `TeacherRatingsPanel({ teacherId, month })`, `RATING_FLOOR_MONTH` (Task 7); `isCeoUser`, `useAuth` (`@/hooks/use-auth`); `MonthStepper`, `currentMonthKey`.

- [ ] **Step 1: Tab qo'shish**

Importlar:

```tsx
import { useAuth, isCeoUser } from "@/hooks/use-auth";
import { MonthStepper } from "@/components/shared/month-stepper";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { TeacherRatingsPanel } from "@/components/reports/lesson-ratings/teacher-ratings-panel";
import { RATING_FLOOR_MONTH } from "@/components/reports/lesson-ratings/rating-format";
```

Komponent ichida (`canSeeTimeline` yonida):

```tsx
  const isCeo = isCeoUser(useAuth((s) => s.user));
  const [ratingMonth, setRatingMonth] = useState(currentMonthKey);
```

`TabsList` oxiriga:

```tsx
        {isCeo && <TabsTrigger value="baholar">Baholar</TabsTrigger>}
```

`TabsContent`lar oxiriga (Radix faol bo'lmagan tab'ni o'chiradi — so'rov faqat ochilganda ketadi):

```tsx
      {/* Baholar — faqat CEO (spec 2026-10-13 §6.4) */}
      {isCeo && (
        <TabsContent value="baholar" className="space-y-4">
          <div className="flex justify-end">
            <MonthStepper
              value={ratingMonth}
              min={RATING_FLOOR_MONTH}
              max={currentMonthKey()}
              onChange={setRatingMonth}
            />
          </div>
          <TeacherRatingsPanel teacherId={teacher.id} month={ratingMonth} />
        </TabsContent>
      )}
```

URL'dagi tab (`?tab=baholar`) `teacher-profile-client.tsx` orqali allaqachon saqlanadi — u `activeTab`ni `searchParams`dan o'qiydi; qo'shimcha o'zgarish kerak emas.

- [ ] **Step 2: Tekshirish**

Run: `cd client && npx tsc --noEmit -p . && npx eslint src/components/teachers/teacher-profile-tabs.tsx`
Expected: xatosiz

- [ ] **Step 3: Commit**

```bash
cd client && git add src/components/teachers/teacher-profile-tabs.tsx
git commit -m "feat(client): ustoz profilida «Baholar» tab'i — faqat CEO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Hujjatlar — ADR, CLAUDE.md, CONTEXT.md, qo'llanma

**Files:**
- Create: `docs/adr/0091-dars-bahosi-faqat-ceo-telegram-darhol.md` (raqamni `docs/adr/README.md` va `git log origin/main -- docs/adr` bo'yicha tekshiring; band bo'lsa keyingisi)
- Modify: `docs/adr/README.md` (indeks qatori)
- Modify: `server/CLAUDE.md` («Tasks» bo'limidan oldin yangi bo'lim)
- Modify: `client/CLAUDE.md` («Marketing report» bo'limidan keyin)
- Modify: `CONTEXT.md` (atama)
- Create: `client/src/qollanma/sahifalar/hisobotlar.ts`
- Create: `client/src/qollanma/kontent/hisobotlar/dars-baholari.mdx`
- Modify: `client/src/qollanma/sahifalar/index.ts`
- Modify: `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: ADR** — mavjud ADR shakliga qarang (`sed -n 1,40p docs/adr/0088-*.md`) va o'sha sarlavhalar bilan yozing:

```markdown
# 0091. Dars bahosi: faqat CEO ko'radi, Telegram'da darhol so'raladi

**Holati:** Qabul qilindi
**Sana:** 2026-10-13
**Bog'liq:** ADR-0025, ADR-0054, ADR-0066, ADR-0078, ADR-0087; spec `docs/superpowers/specs/2026-10-13-dars-baholari-design.md`

## Kontekst
Dars sifati faqat shikoyat yoki o'quvchi ketganda ma'lum bo'lardi.

## Qaror
1. Dars tugaganidan 10 daqiqa – 3 soat ichida, davomatda PRESENT/LATE turgan, Telegram chati ishlaydigan o'quvchiga bot 1–5 tugmali xabar yuboradi. Qaysi dars — «Dars bo'ldimi?» qoidasi (`loadEndedLessonsToday` → `endedLessonsOn`).
2. Bitta dars, bitta o'quvchi — bitta `LessonRating` qatori; qator xabardan oldin yoziladi (unique kalit takror yuborishni to'xtatadi). Telegram rad etsa — FAILED, qayta urinilmaydi.
3. Baho 48 soat ichida, bir marta; 1–3 da «Nima yoqmadi?» (force_reply), izoh bir marta, 500 belgigacha.
4. Dars ustozlari yuborilgan paytda muzlatiladi (o'rinbosar hisobga olinadi).
5. Baholarni faqat CEO ko'radi — `@CeoOnly()`, imkoniyat emas: hech kimga berib bo'lmaydi.
6. ADR-0025 ro'yxatiga qo'shimcha: baho xabari darhol yuboriladi (20:00 yig'masiga emas); cron 22:50 da tugaydi.
7. Yoqish — kompaniya darajasidagi `lessonRating.enabled`, boshlang'ich qiymat o'chiq.

## Oqibatlar
- Eslatma yo'q: javob ulushi past bo'lishi mumkin; sahifa uni ko'rsatadi.
- Rad etilgan chatga (ADR-0066) so'rov yuborilmaydi.
- Ikki ustozli dars ikkala ustozga ham sanaladi; ustozlar yig'indisi jami bilan teng emas.
```

`docs/adr/README.md` jadvaliga (0088 qatoridan keyin):

```markdown
| [0091](0091-dars-bahosi-faqat-ceo-telegram-darhol.md) | Dars bahosi: dars tugagach 10 daq – 3 soat ichida kelgan o'quvchiga Telegram'da 1–5 (darhol, ADR-0025 ro'yxatiga qo'shimcha); bitta qator, 48 soat, bitta baho va izoh; ustoz muzlatiladi; faqat CEO ko'radi (`@CeoOnly()`); `lessonRating.enabled` boshida o'chiq | Qabul qilindi | 2026-10-13 |
```

- [ ] **Step 2: `server/CLAUDE.md`** — «### Tasks (`src/tasks/`)» sarlavhasidan oldin (inglizcha, fayl siyosati bo'yicha):

```markdown
### Lesson ratings (`src/lesson-ratings/`, ADR-0091)

- **Who is asked:** `LessonRatingSenderService` (`@Cron('0 */10 7-22 * * 1-6')`, Tashkent) reads today's ended lessons through `loadEndedLessonsToday` (`attendance/shared/load-ended-lessons.ts`, shared with «Dars bo'ldimi?») and asks, 10–180 minutes after the lesson's end, every PRESENT/LATE student whose card is live and whose `telegramChatId` is set and not disconnected (ADR-0066). Off while `lessonRating.enabled` (company-level, default false) is off.
- **One row per lesson and student** (`LessonRating`, unique `groupId + studentId + date`), written BEFORE the message, so two instances never send twice (`P2002` → skip). `messageId` set = delivered; a refused send is `FAILED` and never retried. `teacherIds` and `branchId` are frozen at send time (a `LessonTeacherOverride` wins over `GroupTeacher`).
- **Bot:** `LessonRatingTelegramHandler` registers one `Composer` through `useBeforeScenes` (as tasks do): `lr:<id>:<1-5>` — the pressing chat must be the row's, 48 hours, first score wins (`updateMany where score: null`); a score ≤ 3 sends a `force_reply` «Nima yoqmadi?» whose id is `promptMessageId`; a text reply to it is the comment (first one wins, 500 chars). Everything else goes `next()`. Pure rules: `rating-rules.ts`; aggregates: `rating-math.ts`.
- **Reads are the CEO's alone:** every `/lesson-ratings/*` route is `@CeoOnly()` (identity, never a capability); the three GETs take `@BranchScope()`, `PATCH /lesson-ratings/settings` is `COMPANY_WIDE`. A rating is counted for every teacher of its lesson, so the teachers' rows do not add up to the total.
```

- [ ] **Step 3: `client/CLAUDE.md`** — «### Marketing report» bo'limidan keyin:

```markdown
### Lesson ratings (`/reports/dars-baholari`, ADR-0091)

- CEO only, by identity: the report item has `forRoles: [1]` (`reports-nav.ts`; `canEnterReports` / `canOpenReportPath` take the user's role ids), the teacher profile's «Baholar» tab is drawn for `isCeoUser(user)`. The server refuses everyone else (`@CeoOnly()`).
- `components/reports/lesson-ratings/`: `lesson-ratings-client.tsx` (month `?month=`, open teacher `?ustoz=`, the «Baho so'rash» switch), `rating-teachers-table.tsx`, `rating-low-list.tsx`, `teacher-ratings-panel.tsx` (shared by the drawer and the profile tab), `rating-format.ts` (pure, vitest). Every figure is the server's; the client only formats.
```

- [ ] **Step 4: `CONTEXT.md`** — atamalar ro'yxatiga alifbo bo'yicha (mavjud shaklga moslab):

```markdown
- **Dars bahosi** — o'quvchining darsdan keyin Telegram'da qo'ygan 1–5 bahosi (va 1–3 da ixtiyoriy izoh). Bitta dars, bitta o'quvchi — bitta qator; faqat CEO ko'radi. `server/src/lesson-ratings/`, ADR-0091.
```

- [ ] **Step 5: Qo'llanma**

`client/src/qollanma/sahifalar/hisobotlar.ts`

```ts
import type { QollanmaSahifa } from "../turlar";

export const hisobotlar: QollanmaSahifa[] = [
  {
    bolim: "hisobotlar",
    sahifa: "dars-baholari",
    sarlavha: "Dars baholari",
    qisqacha:
      "O'quvchi darsdan keyin Telegram botda darsga 1 dan 5 gacha baho qo'yadi, past bahoda sababini yozadi. CEO ustozlarning o'rtacha bahosi, javob ulushi va past baholarni shu sahifada ko'radi.",
    rollar: [1],
    adr: ["0091"],
    yollar: ["/reports/dars-baholari"],
    kalitSozlar: ["baho", "dars bahosi", "yulduz", "o'quvchi fikri", "ustoz sifati", "past baho", "izoh"],
    yangilangan: "2026-10-13",
  },
];
```

`client/src/qollanma/sahifalar/index.ts`: `import { hisobotlar } from "./hisobotlar";` va massivni `[...boshlash, ...oquvchilar, ...guruhlar, ...davomat, ...tolovlar, ...hisobotlar]` qiling (`bolimlar.ts` tartibi: tolovlar → … → hisobotlar).

`client/src/qollanma/kontent/hisobotlar/dars-baholari.mdx` (sarlavha `#` YO'Q; `{`, `}`, `<` ishlatmang; real raqam/ism yo'q):

```mdx
## Qanday ishlaydi

Dars tugaganidan 10 daqiqa o'tgach bot darsga kelgan har bir o'quvchiga xabar yuboradi: «Bugungi darsi qanday o'tdi?» va beshta tugma — 1 ⭐ dan 5 ⭐ gacha. Kech kelgan o'quvchidan ham so'raladi; kelmagan, sababli yoki dars bekor qilingan bo'lsa — so'ralmaydi.

- Baho 48 soat ichida qabul qilinadi va bir marta qo'yiladi.
- 1, 2 yoki 3 qo'ygan o'quvchidan bot «Nima yoqmadi?» deb so'raydi; javob yozish ixtiyoriy.
- Eslatma yuborilmaydi: baho qo'yilmasa, keyingi darsdan keyin yana so'raladi.
- Botni bloklagan yoki Telegram'ga bog'lanmagan o'quvchidan so'ralmaydi.

<Eslatma tur="malumot">
Baholarni faqat CEO ko'radi. Administrator, filial direktori va ustoz bu sahifani ham, baholarni ham ko'rmaydi.
</Eslatma>

## Yoqish

Sahifa tepasidagi «Baho so'rash» kaliti tizimni butun markaz uchun yoqadi yoki o'chiradi. Boshida o'chiq turadi.

## Sahifada nima bor

- **O'rtacha baho** — tanlangan oyda qo'yilgan baholar bo'yicha, o'tgan oyga nisbatan o'zgarish bilan.
- **Javob berganlar** — xabar yetgan o'quvchilardan nechtasi baho qo'ygani.
- **Past baholar** — 1–3 baholar soni.
- **Ustozlar** — eng past o'rtacha tepada. Qator bosilsa oyma-oy o'rtacha, guruhlar va izohlar ochiladi.
- **Past baholar ro'yxati** — sana, guruh, ustoz, o'quvchi, baho va izoh. O'quvchi ismi profiliga olib boradi.

Ikki ustozli darsdagi baho ikkala ustozga ham hisoblanadi, shuning uchun ustozlar bo'yicha sonlar yig'indisi jamidan katta bo'lishi mumkin.

Ustoz profilida ham «Baholar» tab'i bor — u ham faqat CEO'ga ko'rinadi.
```

`client/src/qollanma/yangiliklar.ts` — massiv boshiga:

```ts
  {
    sana: "2026-10-13",
    sarlavha: "Dars baholari",
    matn: "O'quvchilar endi darsdan keyin Telegram botda darsga 1 dan 5 gacha baho qo'yadi; 1–3 qo'ysa, sababini yozishi mumkin. Hisobotlar → «Dars baholari» sahifasida ustozlarning o'rtacha bahosi, javob ulushi va past baholar ko'rinadi; ustoz profilida «Baholar» tab'i qo'shildi. Baholarni faqat CEO ko'radi. Tizim sahifadagi «Baho so'rash» kaliti bilan yoqiladi.",
    rollar: [1],
    sahifa: { bolim: "hisobotlar", sahifa: "dars-baholari" },
  },
```

- [ ] **Step 6: Qo'llanma testlari**

Run: `cd client && npx vitest --config vitest.config.ts run src/qollanma`
Expected: PASS (`reyestr.test.ts` ADR fayli, `yollar` marshruti va h1 yo'qligini tekshiradi)

- [ ] **Step 7: Commit**

```bash
cd .. && git add docs/adr CONTEXT.md server/CLAUDE.md client/CLAUDE.md client/src/qollanma
git commit -m "docs(lesson-ratings): ADR-0091, CLAUDE.md, CONTEXT.md va qo'llanma sahifasi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: To'liq tekshiruv

- [ ] **Step 1: Server**

```bash
cd server && npm run typecheck && npm test && npx eslint src --quiet && npm run build
```

Expected: hammasi yashil. Yiqilgan test bo'lsa — sababini tuzating, `--no-verify` yoki testni o'chirish yo'q.

- [ ] **Step 2: Klient**

```bash
cd ../client && npm test && npx eslint src --quiet && npm run build
```

Expected: yashil; `npm run build` `/reports/dars-baholari`ni yig'adi.

- [ ] **Step 3: Qo'lda (ixtiyoriy, test bot bilan)**

Faqat lokal/test bazada va test bot tokeni bilan (prod bazaga ulangan server bilan EMAS): bir guruhda davomat oling, `lessonRating.enabled`ni sahifadan yoqing, `LessonRatingSenderService.run()` ni dars tugaganidan 10+ daqiqa keyin ishga tushiring → xabar keladi → 2 ⭐ → «Nima yoqmadi?» → javob → sahifada ustoz qatori va «Past baholar»da ko'rinadi. Test muhiti bo'lmasa — bu qadamni o'tkazib yuboring va PR tavsifida ayting.

- [ ] **Step 4: Natija haqida xabar**

Foydalanuvchiga: qaysi commitlar, testlar natijasi, qo'lda tekshiruv qilinganmi yoki yo'q. Deploy va PR — faqat foydalanuvchi so'rasa (`superpowers:finishing-a-development-branch`).
