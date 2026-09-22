# Ilova faolligi: statistika va ekranlar — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchining ilovadagi faol vaqti, radio vaqti, shug'ullangan kunlari, mashq natijalari va kurs progressini guruh sahifasining «Ilova faolligi» tabida, o'quvchi yon oynasida va o'quvchi profilining «Ilova» tabida ko'rsatish (dizayn 6–7-bo'limlar, 3-bosqich).

**Architecture:** Server `server/src/app-activity/stats/` da sof (bazasiz) funksiyalar — davr oynasi, kunlik yig'indi (kunlik chegara bilan), mashq natijasi, daraja, qiyin elementlar — va ularni chaqiradigan bitta `AppActivityStatsService` (guruh uchun o'zgarmas sondagi so'rov). Uchta GET route: ikkitasi guruh ostida (`assertCallerMayTouchGroup`), bittasi o'quvchi ostida (`assertCallerMayTouchStudent`). Klient `client/src/components/groups/app-activity/` da CEO ko'rgan demo ko'rinishini haqiqiy API bilan quradi; yon oyna paneli profil tabida ham qayta ishlatiladi.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL), jest; Next.js 16 + @tanstack/react-query + shadcn/ui, vitest (faqat sof `.test.ts`).

## Global Constraints

- Dizayn manbasi: `docs/superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md` (3, 6, 7-bo'limlar). Ta'riflar kodga shu so'zlar bilan ko'chadi; boshqa ta'rif ishlatilmaydi.
- **Shug'ullangan kun** = Toshkent kuni bo'yicha kamida 1 ta `DafAttempt` (eski DiB yo'llari ham, `sessionId` bo'sh bo'lsa ham) **yoki** kunlik radio yig'indisi ≥ 300 soniya. Faqat kirish sanalmaydi.
- **Ilovaga kirgan (davrda)** = davrda `activeSeconds ≥ 10` bo'lgan kamida bitta `StudentAppSession`.
- **To'g'ri javob %** = baholangan (`GRADED`) savollar bo'yicha birinchi urinish; juftlash savoli (`PAAR` 4, `ZUORDNEN` 6) barcha juftlar birinchi bosishda to'g'ri bo'lsagina to'g'ri; hal bo'lmagan juftlash savoli sanalmaydi; `sessionId`/`questionIndex` bo'sh urinishlar savol ko'rsatkichlaridan chetda. Mavjud `seansYigindisi` bilan BIR XIL qoida — qayta yozilmaydi, undan chiqariladi.
- **Mustahkam so'z** `strength ≥ 3`, **o'rganilmoqda** 1–2, **yangi yoki xato** 0.
- **Kurs** = `DafUnit.code IS NOT NULL AND DafUnit.retiredAt IS NULL` bo'limlarining darslari. Darajalar tartibi `A1 < A2 < B1`. Maxraj bazadan olinadi, kodda raqam yozilmaydi.
- **Davr**: 7 yoki 30 kun — bugun (Toshkent) va undan oldingi 6/29 kun. Standart 7. **Maxraj** = `bugun − hisobBoshi + 1`, `hisobBoshi = max(davrBoshi, akkaunt yaratilgan kun, kompaniyadagi eng birinchi StudentAppSession.day)`. Shug'ullangan kunlar faqat `[hisobBoshi, bugun]` ichida sanaladi.
- **Kunlik chegara (ADR-0020 talabi):** bir kunning faol va radio yig'indisi shu kun seanslarining `[firstSeenAt, lastSeenAt + 120 s]` oraliqlari birlashmasi uzunligidan oshmaydi.
- **Guruh a'zolari** = `Enrollment.status = ACTIVE`, `deletedAt = null`.
- Rollar: guruh route'lari `'CEO', 'Branch Director', 'Administrator', 'Teacher'`; profil route'i `'CEO', 'Branch Director', 'Administrator'`. Rol nomlari aynan shunday yoziladi.
- Guruh endpointidagi so'rovlar soni o'quvchilar soniga bog'liq emas (test bilan).
- Toshkent sanalari faqat `server/src/common/date/tashkent.ts` orqali. Yangi route'lar `server/src/common/auth/branch-route-policy.ts` da toifalanadi.
- UI matni va kod izohlari lotin o'zbekchada, kirill harfi yo'q; `client/CLAUDE.md` inglizcha.
- Admin panelda `amber-50/100/500/600/700` ishlatilmaydi (rangsiz chiqadi) — `yellow-*`.
- Guruh jadvali **sahifalanmaydi** (dizayn 7-bo'lim, CLAUDE.md sahifalash qoidasiga ongli istisno — kodda izoh bilan).
- Har task oxirida: server `npm test`, `npm run typecheck`, `npx eslint src` (0 xato); klient `npm test`, `npm run typecheck`, `npx eslint src` (0 xato), `npm run build` (klient tasklarida). Prettier xatosi CI ni yiqitadi.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Ish faqat `.worktrees/ilova-faolligi-ekranlar` ichida. Demo fayllari `.worktrees/ilova-faolligi-demo/client/src/components/groups/app-activity/` da (commit qilinmagan) — faqat o'qiladi.

---

## Fayl tuzilmasi

**Server (`server/src/`)**
- Modify `daf/uebung/seans-natija.ts` — `savolNatijalari()` chiqariladi, `seansYigindisi` undan foydalanadi.
- Modify `daf/daf.module.ts` — `FortschrittService` eksport.
- Create `app-activity/stats/davr.ts` — davr oynasi va maxraj.
- Create `app-activity/stats/kunlik-faollik.ts` — seanslarni kunlarga yig'ish, kunlik chegara.
- Create `app-activity/stats/mashq-natijasi.ts` — savollar, to'g'ri %, ko'nikmalar, kunlik savollar.
- Create `app-activity/stats/davr-surati.ts` — bir o'quvchining davr surati (jadval qatori va yon oyna shu funksiyadan).
- Create `app-activity/stats/daraja.ts` — joriy daraja, darajalar qatorlari.
- Create `app-activity/stats/qiyin-elementlar.ts` — guruh qiynalayotgan elementlar.
- Create `app-activity/app-activity-stats.types.ts` — API javob shartnomasi.
- Create `app-activity/app-activity-stats.service.ts` — so'rovlar va yig'ish.
- Create `app-activity/dto/app-activity-query.dto.ts`.
- Create `app-activity/group-app-activity.controller.ts`, `app-activity/student-app-activity.controller.ts`.
- Modify `app-activity/app-activity.module.ts`, `common/auth/branch-route-policy.ts`.

**Klient (`client/src/`)**
- Create `lib/daf-format-nomlari.ts` (`media-fragen-panel.tsx` dagi `FORMAT_NOMLARI` shu yerga ko'chadi).
- Create `components/groups/app-activity/types.ts`, `activity-format.ts` (+ `.test.ts`), `use-app-activity.ts`, `activity-ui.tsx`, `group-app-activity-tab.tsx`, `group-activity-table.tsx`, `difficult-items.tsx`, `student-activity-panel.tsx`, `student-activity-sections.tsx`, `student-activity-sheet.tsx`.
- Create `components/students/student-app-activity-tab.tsx`.
- Modify `components/groups/group-detail-tabs.tsx`, `components/students/student-profile-tabs.tsx`, `components/media/media-fragen-panel.tsx`.

---

### Task 1: Savol natijalari va Fortschritt eksporti

**Files:**
- Modify: `server/src/daf/uebung/seans-natija.ts`
- Modify: `server/src/daf/uebung/seans-natija.spec.ts` (mavjud bo'lsa; bo'lmasa Create)
- Modify: `server/src/daf/daf.module.ts:33`

**Interfaces:**
- Produces: `savolNatijalari(satrlar: UrinishSatri[]): SavolNatijasi[]`, `interface SavolNatijasi { questionIndex: number; format: string | null; togri: boolean; vaqt: Date | null }`; `UrinishSatri` ga ixtiyoriy `createdAt?: Date`. `DafModule.exports` ga `FortschrittService`.

- [ ] **Step 1: Failing test** — `seans-natija.spec.ts` ga qo'shing (mavjud `seansYigindisi` testlari o'zgarmaydi):

```ts
import { savolNatijalari, seansYigindisi, UrinishSatri } from './seans-natija';

const satr = (o: Partial<UrinishSatri>): UrinishSatri => ({
  questionIndex: 0,
  attemptNo: 1,
  format: 'WORT_UZ',
  score: 1,
  gradingStatus: 'GRADED',
  ...o,
});

describe('savolNatijalari', () => {
  it('oddiy savol: birinchi urinish bali, o`rinbosar hisobga kirmaydi', () => {
    const t1 = new Date('2026-09-10T05:00:00Z');
    const natija = savolNatijalari([
      satr({ questionIndex: 0, score: 0, createdAt: t1 }),
      satr({ questionIndex: 0, attemptNo: 2, score: 1 }),
      satr({ questionIndex: 1, score: 1, format: 'LUECKE' }),
    ]);
    expect(natija).toEqual([
      { questionIndex: 0, format: 'WORT_UZ', togri: false, vaqt: t1 },
      { questionIndex: 1, format: 'LUECKE', togri: true, vaqt: null },
    ]);
  });

  it('juftlash: xato bor — noto`g`ri; hammasi to`g`ri — to`g`ri; yetmagan — yo`q', () => {
    const paar = (qi: number, score: number) => satr({ questionIndex: qi, format: 'PAAR', score });
    const natija = savolNatijalari([
      paar(0, 1), paar(0, 0), paar(0, 1),
      paar(1, 1), paar(1, 1), paar(1, 1), paar(1, 1),
      paar(2, 1), paar(2, 1),
    ]);
    expect(natija.map((n) => [n.questionIndex, n.togri])).toEqual([
      [0, false],
      [1, true],
    ]);
  });

  it('PENDING va questionIndex bo`sh satrlar chetda', () => {
    expect(
      savolNatijalari([
        satr({ gradingStatus: 'PENDING' }),
        satr({ questionIndex: null }),
      ]),
    ).toEqual([]);
  });

  it('vaqt — savolning eng erta birinchi urinishi', () => {
    const erta = new Date('2026-09-10T05:00:00Z');
    const kech = new Date('2026-09-10T05:00:09Z');
    const [n] = savolNatijalari([
      satr({ format: 'ZUORDNEN', score: 1, createdAt: kech }),
      satr({ format: 'ZUORDNEN', score: 0, createdAt: erta }),
    ]);
    expect(n.vaqt).toEqual(erta);
  });

  it('seansYigindisi savolNatijalari bilan mos', () => {
    const satrlar = [satr({ questionIndex: 0, score: 1 }), satr({ questionIndex: 1, score: 0 })];
    expect(seansYigindisi(satrlar)).toEqual({ questionCount: 2, firstTryCorrect: 1 });
  });
});
```

- [ ] **Step 2: Run** `cd server && npx jest src/daf/uebung/seans-natija.spec.ts` — Expected: FAIL (`savolNatijalari` is not a function).

- [ ] **Step 3: Implement** — `seans-natija.ts` da `UrinishSatri` ga `createdAt?: Date;` qo'shing va `seansYigindisi` ni quyidagiga almashtiring (izohdagi SHARTNOMA matni `savolNatijalari` ichidagi juftlash tarmog'iga ko'chadi, o'zgarishsiz):

```ts
export interface SavolNatijasi {
  questionIndex: number;
  format: string | null;
  togri: boolean;
  /** Savolning eng erta birinchi urinishi — kunlik savollar soni uchun. */
  vaqt: Date | null;
}

function engErta(urinishlar: UrinishSatri[]): Date | null {
  let min: Date | null = null;
  for (const u of urinishlar) {
    if (u.createdAt && (min === null || u.createdAt < min)) min = u.createdAt;
  }
  return min;
}

/**
 * Har savolning birinchi urinish natijasi (yuqoridagi qoidalar). Statistika
 * (dizayn 6.3) va seans yakuni bitta qoidani shu yerdan oladi.
 */
export function savolNatijalari(satrlar: UrinishSatri[]): SavolNatijasi[] {
  const savollar = new Map<number, UrinishSatri[]>();
  for (const satr of satrlar) {
    if (satr.questionIndex == null || satr.attemptNo !== 1) continue;
    if (satr.gradingStatus !== 'GRADED') continue;
    const royxat = savollar.get(satr.questionIndex) ?? [];
    royxat.push(satr);
    savollar.set(satr.questionIndex, royxat);
  }

  const natija: SavolNatijasi[] = [];
  for (const [questionIndex, urinishlar] of savollar) {
    const format = urinishlar[0].format;
    const vaqt = engErta(urinishlar);
    if (juftFormatmi(format)) {
      // SHARTNOMA: (eski izoh matni shu yerga, o'zgarishsiz)
      const xatoBor = urinishlar.some((u) => (u.score ?? 0) < 1);
      const togriSoni = urinishlar.filter((u) => u.score === 1).length;
      if (xatoBor) {
        natija.push({ questionIndex, format, togri: false, vaqt });
      } else if (togriSoni >= JUFT_SONI[format]) {
        natija.push({ questionIndex, format, togri: true, vaqt });
      }
      // Xato yo'q, lekin juftlar yetmagan — hal bo'lmagan, sanalmaydi.
      continue;
    }
    natija.push({ questionIndex, format, togri: urinishlar[0].score === 1, vaqt });
  }
  return natija.sort((a, b) => a.questionIndex - b.questionIndex);
}

export function seansYigindisi(satrlar: UrinishSatri[]): SeansYigindi {
  const natija = savolNatijalari(satrlar);
  return {
    questionCount: natija.length,
    firstTryCorrect: natija.filter((n) => n.togri).length,
  };
}
```

Diqqat: oddiy savolda `urinishlar[0].score` — asl kod bilan bir xil (birinchi kelgan satr). O'zgartirmang.

`daf.module.ts` da: `exports: [DafSeedService, FortschrittService],`

- [ ] **Step 4: Run** `npx jest src/daf/uebung` — Expected: PASS (eski `seansYigindisi` va `uebung.service` testlari ham).

- [ ] **Step 5: Verify & commit** — `npm test && npm run typecheck && npx eslint src`

```bash
git add server/src/daf/uebung/seans-natija.ts server/src/daf/uebung/seans-natija.spec.ts server/src/daf/daf.module.ts
git commit -m "Savol natijalari seans hisobidan ajratildi; Fortschritt eksport qilindi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Davr oynasi va kunlik faollik

**Files:**
- Create: `server/src/app-activity/stats/davr.ts`, `davr.spec.ts`
- Create: `server/src/app-activity/stats/kunlik-faollik.ts`, `kunlik-faollik.spec.ts`

**Interfaces:**
- Consumes: `tashkentDateStr`, `addDaysToDateStr`, `utcMidnightFromDateStr` (`common/date/tashkent.ts`); `SOAT_ZAXIRASI_S`, `bolimlarniOqi`, `Bolim` (`app-activity/heartbeat-merge.ts`).
- Produces: `type Davr = 7 | 30`, `davrniOqi(q?: string): Davr`, `interface DavrOynasi { bugun; davrBoshi; hisobBoshi; maxraj; kunlar: string[] }`, `davrOynasi(davr, now, akkauntYaratilgan: Date, kuzatuvBoshi: string | null): DavrOynasi`, `kunlarOrasi(a, b): number`; `type Platforma`, `interface SeansSatri`, `interface KunYigindisi`, `birlashmaSoniyasi(oraliqlar: [number, number][]): number`, `kunlikYigindi(seanslar: SeansSatri[]): Map<string, KunYigindisi>`, `RADIO_KUN_CHEGARASI_S = 300`, `KIRDI_CHEGARASI_S = 10`, `dayStr(d: Date): string`.

- [ ] **Step 1: Failing tests**

`davr.spec.ts`:
```ts
import { davrniOqi, davrOynasi, kunlarOrasi } from './davr';

// 13.09.2026 10:00 Toshkent = 05:00 UTC
const NOW = new Date('2026-09-13T05:00:00Z');

describe('davr', () => {
  it('davrniOqi: faqat "30" — 30, qolgani 7', () => {
    expect(davrniOqi('30')).toBe(30);
    expect(davrniOqi('7')).toBe(7);
    expect(davrniOqi(undefined)).toBe(7);
    expect(davrniOqi('abc')).toBe(7);
  });

  it('7 kunlik oyna: bugun va oldingi 6 kun', () => {
    const o = davrOynasi(7, NOW, new Date('2026-01-01T00:00:00Z'), '2026-01-01');
    expect(o.bugun).toBe('2026-09-13');
    expect(o.davrBoshi).toBe('2026-09-07');
    expect(o.kunlar).toHaveLength(7);
    expect(o.kunlar[0]).toBe('2026-09-07');
    expect(o.kunlar[6]).toBe('2026-09-13');
    expect(o.hisobBoshi).toBe('2026-09-07');
    expect(o.maxraj).toBe(7);
  });

  it('yangi akkaunt maxrajni qisqartiradi (Toshkent kuni bo`yicha)', () => {
    // 09.09 21:00 UTC = 10.09 02:00 Toshkent
    const o = davrOynasi(30, NOW, new Date('2026-09-09T21:00:00Z'), '2026-08-01');
    expect(o.hisobBoshi).toBe('2026-09-10');
    expect(o.maxraj).toBe(4);
    expect(o.kunlar).toHaveLength(30);
  });

  it('kuzatuv boshlanishi maxrajni qisqartiradi; kuzatuv yo`q — bugun', () => {
    expect(davrOynasi(30, NOW, new Date('2026-01-01'), '2026-09-12').maxraj).toBe(2);
    expect(davrOynasi(30, NOW, new Date('2026-01-01'), null).maxraj).toBe(1);
  });

  it('kunlarOrasi', () => {
    expect(kunlarOrasi('2026-09-01', '2026-09-13')).toBe(12);
    expect(kunlarOrasi('2026-02-27', '2026-03-01')).toBe(2);
  });
});
```

`kunlik-faollik.spec.ts`:
```ts
import { birlashmaSoniyasi, kunlikYigindi, SeansSatri } from './kunlik-faollik';

const t = (hhmmss: string) => new Date(`2026-09-13T${hhmmss}Z`);
const seans = (o: Partial<SeansSatri>): SeansSatri => ({
  day: '2026-09-13',
  firstSeenAt: t('05:00:00'),
  lastSeenAt: t('05:10:00'),
  activeSeconds: 300,
  radioSeconds: 0,
  platform: 'WEB',
  sections: { LERNEN: 200, OTHER: 100 },
  ...o,
});

describe('birlashmaSoniyasi', () => {
  it('ustma-ust oraliqlarni bir marta sanaydi', () => {
    expect(birlashmaSoniyasi([[0, 100_000], [50_000, 150_000], [200_000, 210_000]])).toBe(160);
  });
  it('bo`sh ro`yxat — 0', () => {
    expect(birlashmaSoniyasi([])).toBe(0);
  });
});

describe('kunlikYigindi', () => {
  it('bir kunning seanslari qo`shiladi, platforma va bo`lim bo`yicha', () => {
    const k = kunlikYigindi([
      seans({}),
      seans({ firstSeenAt: t('07:00:00'), lastSeenAt: t('07:05:00'), activeSeconds: 120, platform: 'ANDROID', sections: { OTHER: 120 } }),
    ]).get('2026-09-13')!;
    expect(k.faolSoniya).toBe(420);
    expect(k.platforma).toEqual({ WEB: 300, ANDROID: 120, IOS: 0 });
    expect(k.bolim).toEqual({ LERNEN: 200, OTHER: 220 });
    expect(k.kirdi).toBe(true);
  });

  it('parallel seanslar kunlik birlashmadan oshmaydi (ADR-0020)', () => {
    // ikkala seans 05:00–05:10 (+120 s zaxira) = 720 s birlashma, lekin 600+600 da'vo
    const k = kunlikYigindi([
      seans({ activeSeconds: 600, sections: { LERNEN: 600 } }),
      seans({ activeSeconds: 600, sections: { LERNEN: 600 } }),
    ]).get('2026-09-13')!;
    expect(k.faolSoniya).toBe(720);
    expect(k.bolim.LERNEN).toBe(720);
    expect(k.platforma.WEB).toBe(720);
  });

  it('radio ham birlashma bilan cheklanadi, faolga qo`shilmaydi', () => {
    const k = kunlikYigindi([
      seans({ activeSeconds: 0, radioSeconds: 700, sections: {} }),
      seans({ activeSeconds: 0, radioSeconds: 700, sections: {} }),
    ]).get('2026-09-13')!;
    expect(k.radioSoniya).toBe(720);
    expect(k.faolSoniya).toBe(0);
  });

  it('kirdi: 9 s — yo`q, 10 s — ha', () => {
    expect(kunlikYigindi([seans({ activeSeconds: 9, sections: {} })]).get('2026-09-13')!.kirdi).toBe(false);
    expect(kunlikYigindi([seans({ activeSeconds: 10, sections: {} })]).get('2026-09-13')!.kirdi).toBe(true);
  });

  it('turli kunlar alohida', () => {
    const m = kunlikYigindi([seans({}), seans({ day: '2026-09-12' })]);
    expect([...m.keys()].sort()).toEqual(['2026-09-12', '2026-09-13']);
  });
});
```

- [ ] **Step 2: Run** `npx jest src/app-activity/stats` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`davr.ts`:
```ts
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';

/** Dizayn 6.2: oxirgi 7 yoki 30 kun — kalendar oy emas. */
export type Davr = 7 | 30;

export function davrniOqi(qiymat: string | undefined): Davr {
  return qiymat === '30' ? 30 : 7;
}

export interface DavrOynasi {
  bugun: string;
  davrBoshi: string;
  /** max(davrBoshi, akkaunt kuni, kuzatuv boshi) — o'suvchi maxraj boshi. */
  hisobBoshi: string;
  maxraj: number;
  /** davrBoshi..bugun, o'sish tartibida. */
  kunlar: string[];
}

export function kunlarOrasi(a: string, b: string): number {
  return Math.round(
    (utcMidnightFromDateStr(b).getTime() - utcMidnightFromDateStr(a).getTime()) / 86_400_000,
  );
}

const kattasi = (a: string, b: string) => (a > b ? a : b);

export function davrOynasi(
  davr: Davr,
  now: Date,
  akkauntYaratilgan: Date,
  kuzatuvBoshi: string | null,
): DavrOynasi {
  const bugun = tashkentDateStr(now);
  const davrBoshi = addDaysToDateStr(bugun, -(davr - 1));
  let hisobBoshi = kattasi(
    kattasi(davrBoshi, tashkentDateStr(akkauntYaratilgan)),
    kuzatuvBoshi ?? bugun,
  );
  if (hisobBoshi > bugun) hisobBoshi = bugun;
  const kunlar = Array.from({ length: davr }, (_, i) => addDaysToDateStr(davrBoshi, i));
  return { bugun, davrBoshi, hisobBoshi, maxraj: kunlarOrasi(hisobBoshi, bugun) + 1, kunlar };
}
```

`kunlik-faollik.ts`:
```ts
import { Bolim, bolimlarniOqi, SOAT_ZAXIRASI_S } from '../heartbeat-merge';

export type Platforma = 'WEB' | 'ANDROID' | 'IOS';
export const PLATFORMALAR: readonly Platforma[] = ['WEB', 'ANDROID', 'IOS'];

/** Dizayn 3-bo'lim: shug'ullangan kun uchun kunlik radio chegarasi. */
export const RADIO_KUN_CHEGARASI_S = 300;
/** Dizayn 3-bo'lim: «Ilovaga kirgan» uchun bitta seansning faol chegarasi. */
export const KIRDI_CHEGARASI_S = 10;

export interface SeansSatri {
  /** Toshkent kuni, `YYYY-MM-DD`. */
  day: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  activeSeconds: number;
  radioSeconds: number;
  platform: Platforma;
  sections: unknown;
}

export interface KunYigindisi {
  sana: string;
  faolSoniya: number;
  radioSoniya: number;
  platforma: Record<Platforma, number>;
  bolim: Record<Bolim, number>;
  kirdi: boolean;
}

/** `@db.Date` qiymatini `YYYY-MM-DD` ga (u UTC yarim tuni sifatida keladi). */
export function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Oraliqlar (ms) birlashmasining uzunligi, butun soniyalarda. */
export function birlashmaSoniyasi(oraliqlar: [number, number][]): number {
  const tartib = [...oraliqlar].sort((a, b) => a[0] - b[0]);
  let jami = 0;
  let boshi = -Infinity;
  let oxiri = -Infinity;
  for (const [a, b] of tartib) {
    if (a > oxiri) {
      if (oxiri > boshi) jami += oxiri - boshi;
      boshi = a;
      oxiri = b;
    } else if (b > oxiri) {
      oxiri = b;
    }
  }
  if (oxiri > boshi) jami += oxiri - boshi;
  return Math.floor(jami / 1000);
}

/**
 * Seanslarni Toshkent kunlariga yig'adi. Server qirqishi seans bo'yicha
 * (ADR-0020), shuning uchun parallel seanslar kun yig'indisini ko'paytirmasin:
 * faol va radio yig'indisi shu kun seanslarining `[firstSeenAt, lastSeenAt +
 * 120 s]` birlashmasidan oshmaydi. Platforma va bo'limlar faol vaqt bilan bir
 * xil nisbatda qisqaradi.
 */
export function kunlikYigindi(seanslar: SeansSatri[]): Map<string, KunYigindisi> {
  const kunlar = new Map<string, SeansSatri[]>();
  for (const s of seanslar) {
    const royxat = kunlar.get(s.day) ?? [];
    royxat.push(s);
    kunlar.set(s.day, royxat);
  }

  const natija = new Map<string, KunYigindisi>();
  for (const [sana, royxat] of kunlar) {
    const birlashma = birlashmaSoniyasi(
      royxat.map((s) => [
        s.firstSeenAt.getTime(),
        s.lastSeenAt.getTime() + SOAT_ZAXIRASI_S * 1000,
      ]),
    );
    const faolXom = royxat.reduce((j, s) => j + s.activeSeconds, 0);
    const radioXom = royxat.reduce((j, s) => j + s.radioSeconds, 0);
    const faolSoniya = Math.min(faolXom, birlashma);
    const nisbat = faolXom > 0 ? faolSoniya / faolXom : 0;

    const platforma: Record<Platforma, number> = { WEB: 0, ANDROID: 0, IOS: 0 };
    const bolim: Record<Bolim, number> = { LERNEN: 0, OTHER: 0 };
    for (const s of royxat) {
      platforma[s.platform] += s.activeSeconds;
      const b = bolimlarniOqi(s.sections);
      bolim.LERNEN += b.LERNEN ?? 0;
      bolim.OTHER += b.OTHER ?? 0;
    }
    for (const p of PLATFORMALAR) platforma[p] = Math.round(platforma[p] * nisbat);
    bolim.LERNEN = Math.round(bolim.LERNEN * nisbat);
    bolim.OTHER = Math.round(bolim.OTHER * nisbat);

    natija.set(sana, {
      sana,
      faolSoniya,
      radioSoniya: Math.min(radioXom, birlashma),
      platforma,
      bolim,
      kirdi: royxat.some((s) => s.activeSeconds >= KIRDI_CHEGARASI_S),
    });
  }
  return natija;
}
```

Eslatma: `heartbeat-merge.ts` da `SOAT_ZAXIRASI_S` eksport qilinganini tekshiring (`grep -n SOAT_ZAXIRASI_S`). Eksport bo'lmasa, `export` qo'shing.

- [ ] **Step 4: Run** `npx jest src/app-activity/stats` — Expected: PASS.
- [ ] **Step 5: Verify & commit** — `npm test && npm run typecheck && npx eslint src`

```bash
git add server/src/app-activity/stats
git commit -m "Faollik statistikasi: davr oynasi va kunlik chegarali yig'indi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mashq natijasi, davr surati, daraja, qiyin elementlar

**Files:**
- Create: `server/src/app-activity/stats/mashq-natijasi.ts` (+ `.spec.ts`)
- Create: `server/src/app-activity/stats/davr-surati.ts` (+ `.spec.ts`)
- Create: `server/src/app-activity/stats/daraja.ts` (+ `.spec.ts`)
- Create: `server/src/app-activity/stats/qiyin-elementlar.ts` (+ `.spec.ts`)

**Interfaces:**
- Consumes: Task 1 `savolNatijalari`, `UrinishSatri`; `skillFuer`, `DafSkill` (`daf/uebung/format-skill.ts`); Task 2 `DavrOynasi`, `kunlikYigindi`, `SeansSatri`, `Platforma`, `RADIO_KUN_CHEGARASI_S`.
- Produces:
  - `interface MashqUrinishi extends UrinishSatri { sessionId: string | null; createdAt: Date }`
  - `foizi(togri: number, jami: number): number | null`
  - `KONIKMALAR: readonly DafSkill[]`
  - `interface MashqNatijasi { savollar; togri; xatolar; foiz: number | null; konikmalar: { konikma: DafSkill; savollar; togri; foiz: number | null }[]; savolKunlari: Record<string, number> }`
  - `mashqNatijasi(urinishlar: MashqUrinishi[]): MashqNatijasi`
  - `interface KunSurati { sana; faolSoniya; radioSoniya; savollar; shugullangan: boolean; kirdi: boolean; kuzatilgan: boolean }`
  - `interface DavrSurati { kunlar: KunSurati[]; faolSoniya; radioSoniya; platforma: Record<Platforma, number>; bolim: { LERNEN; OTHER }; kirdi: boolean; shugullanganKunlar: number; mashq: MashqNatijasi }`
  - `davrSurati(oyna: DavrOynasi, seanslar: SeansSatri[], urinishlar: MashqUrinishi[]): DavrSurati`
  - `type Daraja = 'A1' | 'A2' | 'B1'`, `DARAJALAR`, `type DarajaHolati = 'DAVOM' | 'TUGATILGAN' | 'BOSHLANMAGAN' | 'KURS_YOQ'`, `interface DarajaQatori { daraja; tugatilgan; jami; holat }`, `interface JoriyDaraja extends DarajaQatori { guruhdanOrqada: boolean }`, `guruhDarajasi(level: string | null): Daraja | null`, `darajaQatorlari(tugatilgan, jami): DarajaQatori[]`, `joriyDaraja({ oxirgiDarsDarajasi, guruhDarajasi, tugatilgan, jami }): JoriyDaraja`
  - `interface ElementAgregati { itemType: string; itemId: number; oquvchilar: number; ortachaBall: number; format: string | null }`, `interface QiyinElement { itemType; itemId; format; konikma: DafSkill | null; xatoFoizi: number; oquvchilar: number }`, `qiyinElementlar(rows: ElementAgregati[]): QiyinElement[]`, `QIYIN_MIN_OQUVCHI = 3`, `QIYIN_SONI = 6`

- [ ] **Step 1: Failing tests**

`mashq-natijasi.spec.ts`:
```ts
import { foizi, mashqNatijasi, MashqUrinishi } from './mashq-natijasi';

const u = (o: Partial<MashqUrinishi>): MashqUrinishi => ({
  sessionId: 's1',
  questionIndex: 0,
  attemptNo: 1,
  format: 'WORT_UZ',
  score: 1,
  gradingStatus: 'GRADED',
  createdAt: new Date('2026-09-13T05:00:00Z'),
  ...o,
});

describe('mashqNatijasi', () => {
  it('seanslar alohida: bir xil questionIndex ikki seansda — ikki savol', () => {
    const n = mashqNatijasi([u({ sessionId: 's1' }), u({ sessionId: 's2', score: 0 })]);
    expect(n).toMatchObject({ savollar: 2, togri: 1, xatolar: 1, foiz: 50 });
  });

  it('sessionId bo`sh (eski yo`l) savol hisobiga kirmaydi', () => {
    expect(mashqNatijasi([u({ sessionId: null })]).savollar).toBe(0);
  });

  it('ko`nikmalar reyestr bo`yicha; SPRECHEN har doim bor, savolsiz', () => {
    const n = mashqNatijasi([
      u({ questionIndex: 0, format: 'WORT_UZ', score: 1 }),
      u({ questionIndex: 1, format: 'LUECKE', score: 0 }),
      u({ questionIndex: 2, format: 'LUECKE', score: 1 }),
    ]);
    const k = Object.fromEntries(n.konikmalar.map((x) => [x.konikma, x]));
    expect(k.WORTSCHATZ).toEqual({ konikma: 'WORTSCHATZ', savollar: 1, togri: 1, foiz: 100 });
    expect(k.GRAMMATIK).toEqual({ konikma: 'GRAMMATIK', savollar: 2, togri: 1, foiz: 50 });
    expect(k.SPRECHEN).toEqual({ konikma: 'SPRECHEN', savollar: 0, togri: 0, foiz: null });
    expect(n.konikmalar).toHaveLength(6);
  });

  it('savolKunlari Toshkent kuni bo`yicha', () => {
    const n = mashqNatijasi([
      u({ questionIndex: 0, createdAt: new Date('2026-09-12T19:30:00Z') }), // 13.09 00:30
      u({ questionIndex: 1, createdAt: new Date('2026-09-12T18:30:00Z') }), // 12.09 23:30
    ]);
    expect(n.savolKunlari).toEqual({ '2026-09-13': 1, '2026-09-12': 1 });
  });

  it('foizi: 0 savol — null, yumaloqlanadi', () => {
    expect(foizi(0, 0)).toBeNull();
    expect(foizi(2, 3)).toBe(67);
  });
});
```

`davr-surati.spec.ts`:
```ts
import { davrOynasi } from './davr';
import { davrSurati } from './davr-surati';
import { SeansSatri } from './kunlik-faollik';
import { MashqUrinishi } from './mashq-natijasi';

const NOW = new Date('2026-09-13T05:00:00Z');
const oyna = davrOynasi(7, NOW, new Date('2026-01-01'), '2026-09-10'); // hisobBoshi 10.09, maxraj 4

const seans = (day: string, o: Partial<SeansSatri> = {}): SeansSatri => ({
  day,
  firstSeenAt: new Date(`${day}T05:00:00Z`),
  lastSeenAt: new Date(`${day}T06:00:00Z`),
  activeSeconds: 600,
  radioSeconds: 0,
  platform: 'WEB',
  sections: { LERNEN: 600 },
  ...o,
});
const urinish = (iso: string, o: Partial<MashqUrinishi> = {}): MashqUrinishi => ({
  sessionId: 's1',
  questionIndex: 0,
  attemptNo: 1,
  format: 'WORT_UZ',
  score: 1,
  gradingStatus: 'GRADED',
  createdAt: new Date(iso),
  ...o,
});

describe('davrSurati', () => {
  it('faqat kirish (mashqsiz, radiosiz) shug`ullangan emas', () => {
    const s = davrSurati(oyna, [seans('2026-09-13')], []);
    expect(s.shugullanganKunlar).toBe(0);
    expect(s.kirdi).toBe(true);
    expect(s.faolSoniya).toBe(600);
    expect(s.kunlar.find((k) => k.sana === '2026-09-13')).toMatchObject({ kirdi: true, shugullangan: false });
  });

  it('bitta urinish (eski DiB yo`li ham) kunni shug`ullangan qiladi', () => {
    const s = davrSurati(oyna, [], [urinish('2026-09-12T05:00:00Z', { sessionId: null, questionIndex: null })]);
    expect(s.shugullanganKunlar).toBe(1);
    expect(s.mashq.savollar).toBe(0);
  });

  it('radio 299 s — yo`q, ikki seans yig`indisi 300 s — ha', () => {
    const yoq = davrSurati(oyna, [seans('2026-09-13', { activeSeconds: 0, radioSeconds: 299, sections: {} })], []);
    expect(yoq.shugullanganKunlar).toBe(0);
    const ha = davrSurati(
      oyna,
      [
        seans('2026-09-13', { activeSeconds: 0, radioSeconds: 150, sections: {} }),
        seans('2026-09-13', { activeSeconds: 0, radioSeconds: 150, sections: {}, firstSeenAt: new Date('2026-09-13T08:00:00Z'), lastSeenAt: new Date('2026-09-13T09:00:00Z') }),
      ],
      [],
    );
    expect(ha.shugullanganKunlar).toBe(1);
  });

  it('kuzatuvdan oldingi mashq kuni suratga kirmaydi, lekin kun ustunida kuzatilgan=false', () => {
    const s = davrSurati(oyna, [], [urinish('2026-09-08T05:00:00Z')]);
    expect(s.shugullanganKunlar).toBe(0);
    const kun = s.kunlar.find((k) => k.sana === '2026-09-08')!;
    expect(kun).toMatchObject({ kuzatilgan: false, shugullangan: false, savollar: 1 });
  });

  it('kirdi: faqat 9 s li seans — yo`q', () => {
    expect(davrSurati(oyna, [seans('2026-09-13', { activeSeconds: 9, sections: {} })], []).kirdi).toBe(false);
  });

  it('davrdan tashqaridagi seans va urinish hisobga kirmaydi', () => {
    const s = davrSurati(oyna, [seans('2026-09-01')], [urinish('2026-09-01T05:00:00Z')]);
    expect(s.faolSoniya).toBe(0);
    expect(s.mashq.savollar).toBe(0);
    expect(s.kunlar).toHaveLength(7);
  });
});
```

`daraja.spec.ts`:
```ts
import { darajaQatorlari, guruhDarajasi, joriyDaraja } from './daraja';

const jami = { A1: 192, A2: 0, B1: 0 };

describe('daraja', () => {
  it('guruhDarajasi matndan', () => {
    expect(guruhDarajasi('A1')).toBe('A1');
    expect(guruhDarajasi('a2.1')).toBe('A2');
    expect(guruhDarajasi('Intensiv')).toBeNull();
    expect(guruhDarajasi(null)).toBeNull();
  });

  it('darajaQatorlari holatlari', () => {
    const q = darajaQatorlari({ A1: 37 }, { A1: 192, A2: 10 });
    expect(q).toEqual([
      { daraja: 'A1', tugatilgan: 37, jami: 192, holat: 'DAVOM' },
      { daraja: 'A2', tugatilgan: 0, jami: 10, holat: 'BOSHLANMAGAN' },
      { daraja: 'B1', tugatilgan: 0, jami: 0, holat: 'KURS_YOQ' },
    ]);
  });

  it('LESSON seansi yo`q — guruh darajasi, u ham yo`q — A1', () => {
    expect(joriyDaraja({ oxirgiDarsDarajasi: null, guruhDarajasi: 'A2', tugatilgan: {}, jami }).daraja).toBe('A2');
    expect(joriyDaraja({ oxirgiDarsDarajasi: null, guruhDarajasi: null, tugatilgan: {}, jami }).daraja).toBe('A1');
  });

  it('A1 tugatilgan, A2 da kurs bor — A2 boshlanmagan', () => {
    const j = joriyDaraja({ oxirgiDarsDarajasi: 'A1', guruhDarajasi: 'A1', tugatilgan: { A1: 5 }, jami: { A1: 5, A2: 8 } });
    expect(j).toMatchObject({ daraja: 'A2', holat: 'BOSHLANMAGAN', tugatilgan: 0, jami: 8, guruhdanOrqada: false });
  });

  it('A1 tugatilgan, A2 da kurs yo`q — A1 tugatilgan', () => {
    const j = joriyDaraja({ oxirgiDarsDarajasi: 'A1', guruhDarajasi: 'A1', tugatilgan: { A1: 5 }, jami: { A1: 5 } });
    expect(j).toMatchObject({ daraja: 'A1', holat: 'TUGATILGAN' });
  });

  it('guruhdan orqada: joriy A1, guruh A2', () => {
    const j = joriyDaraja({ oxirgiDarsDarajasi: 'A1', guruhDarajasi: 'A2', tugatilgan: { A1: 3 }, jami });
    expect(j).toMatchObject({ daraja: 'A1', holat: 'DAVOM', guruhdanOrqada: true });
  });

  it('kurs yo`q daraja', () => {
    expect(joriyDaraja({ oxirgiDarsDarajasi: null, guruhDarajasi: 'B1', tugatilgan: {}, jami }).holat).toBe('KURS_YOQ');
  });
});
```

`qiyin-elementlar.spec.ts`:
```ts
import { qiyinElementlar } from './qiyin-elementlar';

const r = (itemId: number, oquvchilar: number, ortachaBall: number, format = 'WORT_UZ') => ({
  itemType: 'WORT',
  itemId,
  oquvchilar,
  ortachaBall,
  format,
});

describe('qiyinElementlar', () => {
  it('3 dan kam o`quvchi va xatosizlar tushadi; xato bo`yicha kamayish', () => {
    const n = qiyinElementlar([r(1, 2, 0), r(2, 3, 0.5), r(3, 4, 0.25, 'LUECKE'), r(4, 5, 1)]);
    expect(n).toEqual([
      { itemType: 'WORT', itemId: 3, format: 'LUECKE', konikma: 'GRAMMATIK', xatoFoizi: 75, oquvchilar: 4 },
      { itemType: 'WORT', itemId: 2, format: 'WORT_UZ', konikma: 'WORTSCHATZ', xatoFoizi: 50, oquvchilar: 3 },
    ]);
  });

  it('teng xatoda ko`p o`quvchi oldin; eng ko`pi 6 ta', () => {
    const rows = Array.from({ length: 8 }, (_, i) => r(i + 1, 3 + i, 0.5));
    const n = qiyinElementlar(rows);
    expect(n).toHaveLength(6);
    expect(n[0].itemId).toBe(8);
  });
});
```

- [ ] **Step 2: Run** `npx jest src/app-activity/stats` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`mashq-natijasi.ts`:
```ts
import { tashkentDateStr } from '../../common/date/tashkent';
import { DafSkill, skillFuer } from '../../daf/uebung/format-skill';
import { savolNatijalari, UrinishSatri } from '../../daf/uebung/seans-natija';

export interface MashqUrinishi extends UrinishSatri {
  sessionId: string | null;
  createdAt: Date;
}

/** Ekranda ko'rsatish tartibi (dizayn 5.4). SPRECHEN — hozircha format yo'q. */
export const KONIKMALAR: readonly DafSkill[] = [
  'WORTSCHATZ',
  'GRAMMATIK',
  'LESEN',
  'HOEREN',
  'SCHREIBEN',
  'SPRECHEN',
];

export interface KonikmaNatijasi {
  konikma: DafSkill;
  savollar: number;
  togri: number;
  foiz: number | null;
}

export interface MashqNatijasi {
  savollar: number;
  togri: number;
  xatolar: number;
  foiz: number | null;
  konikmalar: KonikmaNatijasi[];
  /** Toshkent kuni → shu kuni birinchi berilgan savollar soni. */
  savolKunlari: Record<string, number>;
}

export function foizi(togri: number, jami: number): number | null {
  return jami === 0 ? null : Math.round((togri * 100) / jami);
}

/**
 * To'g'ri javob % (dizayn 3-bo'lim) — seanslar bo'yicha `savolNatijalari`
 * dan. `sessionId` bo'sh urinishlar (eski klient, DiB yo'llari) savol
 * ko'rsatkichlariga kirmaydi.
 */
export function mashqNatijasi(urinishlar: MashqUrinishi[]): MashqNatijasi {
  const seanslar = new Map<string, MashqUrinishi[]>();
  for (const u of urinishlar) {
    if (!u.sessionId) continue;
    const royxat = seanslar.get(u.sessionId) ?? [];
    royxat.push(u);
    seanslar.set(u.sessionId, royxat);
  }

  const konikma = new Map<DafSkill, { savollar: number; togri: number }>(
    KONIKMALAR.map((k) => [k, { savollar: 0, togri: 0 }]),
  );
  const savolKunlari: Record<string, number> = {};
  let savollar = 0;
  let togri = 0;

  for (const royxat of seanslar.values()) {
    for (const n of savolNatijalari(royxat)) {
      savollar += 1;
      if (n.togri) togri += 1;
      const k = skillFuer(n.format);
      if (k) {
        const hisob = konikma.get(k)!;
        hisob.savollar += 1;
        if (n.togri) hisob.togri += 1;
      }
      if (n.vaqt) {
        const kun = tashkentDateStr(n.vaqt);
        savolKunlari[kun] = (savolKunlari[kun] ?? 0) + 1;
      }
    }
  }

  return {
    savollar,
    togri,
    xatolar: savollar - togri,
    foiz: foizi(togri, savollar),
    konikmalar: KONIKMALAR.map((k) => {
      const h = konikma.get(k)!;
      return { konikma: k, savollar: h.savollar, togri: h.togri, foiz: foizi(h.togri, h.savollar) };
    }),
    savolKunlari,
  };
}
```

`davr-surati.ts`:
```ts
import { tashkentDateStr } from '../../common/date/tashkent';
import { DavrOynasi } from './davr';
import {
  kunlikYigindi,
  Platforma,
  RADIO_KUN_CHEGARASI_S,
  SeansSatri,
} from './kunlik-faollik';
import { mashqNatijasi, MashqNatijasi, MashqUrinishi } from './mashq-natijasi';

export interface KunSurati {
  sana: string;
  faolSoniya: number;
  radioSoniya: number;
  savollar: number;
  shugullangan: boolean;
  kirdi: boolean;
  /** hisobBoshi dan oldingi kun — maxrajga ham, suratga ham kirmaydi. */
  kuzatilgan: boolean;
}

export interface DavrSurati {
  kunlar: KunSurati[];
  faolSoniya: number;
  radioSoniya: number;
  platforma: Record<Platforma, number>;
  bolim: { LERNEN: number; OTHER: number };
  kirdi: boolean;
  shugullanganKunlar: number;
  mashq: MashqNatijasi;
}

/**
 * Bir o'quvchining davr surati. Guruh jadvali qatori ham, yon oyna ham shu
 * funksiyadan — ikki ekran bir o'quvchi haqida ikki xil raqam ko'rsatmaydi.
 */
export function davrSurati(
  oyna: DavrOynasi,
  seanslar: SeansSatri[],
  urinishlar: MashqUrinishi[],
): DavrSurati {
  const kunlarTop = new Set(oyna.kunlar);
  const kunYigindi = kunlikYigindi(seanslar.filter((s) => kunlarTop.has(s.day)));

  const davrUrinishlari: MashqUrinishi[] = [];
  const urinishKunlari = new Set<string>();
  for (const u of urinishlar) {
    const kun = tashkentDateStr(u.createdAt);
    if (!kunlarTop.has(kun)) continue;
    davrUrinishlari.push(u);
    urinishKunlari.add(kun);
  }
  const mashq = mashqNatijasi(davrUrinishlari);

  const platforma: Record<Platforma, number> = { WEB: 0, ANDROID: 0, IOS: 0 };
  const bolim = { LERNEN: 0, OTHER: 0 };
  let faolSoniya = 0;
  let radioSoniya = 0;
  let kirdi = false;
  let shugullanganKunlar = 0;

  const kunlar = oyna.kunlar.map((sana): KunSurati => {
    const k = kunYigindi.get(sana);
    const kuzatilgan = sana >= oyna.hisobBoshi;
    const shugullangan =
      kuzatilgan &&
      (urinishKunlari.has(sana) || (k?.radioSoniya ?? 0) >= RADIO_KUN_CHEGARASI_S);
    if (k) {
      faolSoniya += k.faolSoniya;
      radioSoniya += k.radioSoniya;
      platforma.WEB += k.platforma.WEB;
      platforma.ANDROID += k.platforma.ANDROID;
      platforma.IOS += k.platforma.IOS;
      bolim.LERNEN += k.bolim.LERNEN;
      bolim.OTHER += k.bolim.OTHER;
      if (k.kirdi) kirdi = true;
    }
    if (shugullangan) shugullanganKunlar += 1;
    return {
      sana,
      faolSoniya: k?.faolSoniya ?? 0,
      radioSoniya: k?.radioSoniya ?? 0,
      savollar: mashq.savolKunlari[sana] ?? 0,
      shugullangan,
      kirdi: k?.kirdi ?? false,
      kuzatilgan,
    };
  });

  return { kunlar, faolSoniya, radioSoniya, platforma, bolim, kirdi, shugullanganKunlar, mashq };
}
```

`daraja.ts`:
```ts
export type Daraja = 'A1' | 'A2' | 'B1';
export const DARAJALAR: readonly Daraja[] = ['A1', 'A2', 'B1'];

export type DarajaHolati = 'DAVOM' | 'TUGATILGAN' | 'BOSHLANMAGAN' | 'KURS_YOQ';

export interface DarajaQatori {
  daraja: Daraja;
  tugatilgan: number;
  jami: number;
  holat: DarajaHolati;
}

export interface JoriyDaraja extends DarajaQatori {
  guruhdanOrqada: boolean;
}

type Sonlar = Partial<Record<Daraja, number>>;

/** `Group.level` erkin matn — boshidagi A1/A2/B1 olinadi. */
export function guruhDarajasi(level: string | null): Daraja | null {
  const m = /^(A1|A2|B1)/i.exec(level?.trim() ?? '');
  return m ? (m[1].toUpperCase() as Daraja) : null;
}

function qator(daraja: Daraja, tugatilgan: Sonlar, jami: Sonlar): DarajaQatori {
  const t = tugatilgan[daraja] ?? 0;
  const j = jami[daraja] ?? 0;
  const holat: DarajaHolati =
    j === 0 ? 'KURS_YOQ' : t >= j ? 'TUGATILGAN' : t === 0 ? 'BOSHLANMAGAN' : 'DAVOM';
  return { daraja, tugatilgan: t, jami: j, holat };
}

export function darajaQatorlari(tugatilgan: Sonlar, jami: Sonlar): DarajaQatori[] {
  return DARAJALAR.map((d) => qator(d, tugatilgan, jami));
}

/**
 * Dizayn 6.4. Joriy daraja — oxirgi LESSON seansidagi darsning darajasi; u
 * to'liq tugatilgan va keyingi darajada kurs bo'lsa — keyingi daraja.
 * LESSON seansi bo'lmasa — guruh darajasi, u ham bo'lmasa A1.
 */
export function joriyDaraja(input: {
  oxirgiDarsDarajasi: Daraja | null;
  guruhDarajasi: Daraja | null;
  tugatilgan: Sonlar;
  jami: Sonlar;
}): JoriyDaraja {
  const { oxirgiDarsDarajasi, tugatilgan, jami } = input;
  let daraja: Daraja = oxirgiDarsDarajasi ?? input.guruhDarajasi ?? 'A1';
  if (oxirgiDarsDarajasi) {
    const joriy = qator(daraja, tugatilgan, jami);
    const keyingi = DARAJALAR[DARAJALAR.indexOf(daraja) + 1];
    if (joriy.holat === 'TUGATILGAN' && keyingi && (jami[keyingi] ?? 0) > 0) {
      daraja = keyingi;
    }
  }
  const guruh = input.guruhDarajasi;
  return {
    ...qator(daraja, tugatilgan, jami),
    guruhdanOrqada: guruh !== null && DARAJALAR.indexOf(daraja) < DARAJALAR.indexOf(guruh),
  };
}
```

`qiyin-elementlar.ts`:
```ts
import { DafSkill, skillFuer } from '../../daf/uebung/format-skill';

export const QIYIN_MIN_OQUVCHI = 3;
export const QIYIN_SONI = 6;

/** SQL yig'indisidan bitta satr: `(itemType, itemId)` bo'yicha birinchi urinishlar. */
export interface ElementAgregati {
  itemType: string;
  itemId: number;
  oquvchilar: number;
  ortachaBall: number;
  /** Eng ko'p uchragan format. */
  format: string | null;
}

export interface QiyinElement {
  itemType: string;
  itemId: number;
  format: string | null;
  konikma: DafSkill | null;
  xatoFoizi: number;
  oquvchilar: number;
}

/** Dizayn 6.5: kamida 3 xil o'quvchi, xato foizi = 1 − o'rtacha ball, eng yuqori 6. */
export function qiyinElementlar(rows: ElementAgregati[]): QiyinElement[] {
  return rows
    .filter((r) => r.oquvchilar >= QIYIN_MIN_OQUVCHI)
    .map((r) => ({
      itemType: r.itemType,
      itemId: r.itemId,
      format: r.format,
      konikma: skillFuer(r.format),
      xatoFoizi: Math.round((1 - r.ortachaBall) * 100),
      oquvchilar: r.oquvchilar,
    }))
    .filter((r) => r.xatoFoizi > 0)
    .sort(
      (a, b) =>
        b.xatoFoizi - a.xatoFoizi ||
        b.oquvchilar - a.oquvchilar ||
        a.itemType.localeCompare(b.itemType) ||
        a.itemId - b.itemId,
    )
    .slice(0, QIYIN_SONI);
}
```

- [ ] **Step 4: Run** `npx jest src/app-activity/stats` — Expected: PASS.
- [ ] **Step 5: Verify & commit** — `npm test && npm run typecheck && npx eslint src`

```bash
git add server/src/app-activity/stats
git commit -m "Faollik statistikasi: mashq natijasi, davr surati, daraja, qiyin elementlar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `AppActivityStatsService` va javob shartnomasi

**Files:**
- Create: `server/src/app-activity/app-activity-stats.types.ts`
- Create: `server/src/app-activity/app-activity-stats.service.ts`
- Create: `server/src/app-activity/app-activity-stats.service.spec.ts`
- Modify: `server/src/app-activity/app-activity.module.ts`

**Interfaces:**
- Consumes: Task 2–3 hammasi; `FortschrittService.uebersicht(studentId, companyId): Promise<Fortschritt>` (`daf/fortschritt/fortschritt.service.ts`); `PrismaService`.
- Produces: `AppActivityStatsService` metodlari `guruhFaolligi(groupId: string, companyId: number, davr: Davr, now: Date): Promise<GuruhFaolligi>`, `oquvchiFaolligi(studentId: number, companyId: number, davr: Davr, now: Date): Promise<OquvchiFaolligi>`, `guruhAzosiEkaniniTekshir(groupId: string, studentId: number): Promise<void>` (404 `"O'quvchi bu guruhning faol a'zosi emas"`). Tiplar `app-activity-stats.types.ts` dan (quyida) — Task 6 klient tiplari shu nomlarni aynan takrorlaydi.

- [ ] **Step 1: Types** — `app-activity-stats.types.ts`:

```ts
import { Davr } from './stats/davr';
import { DarajaQatori, JoriyDaraja, Daraja } from './stats/daraja';
import { KunSurati } from './stats/davr-surati';
import { Platforma } from './stats/kunlik-faollik';
import { KonikmaNatijasi } from './stats/mashq-natijasi';
import { QiyinElement } from './stats/qiyin-elementlar';

/** API javob shartnomasi (dizayn 6–7). Klient `components/groups/app-activity/types.ts` aynan shu. */

export interface OxirgiFaollik {
  vaqt: string; // ISO
  platforma: Platforma;
}

export interface GuruhOquvchiQatori {
  studentId: number;
  ism: string;
  photo: string | null;
  akkaunt: boolean;
  oxirgiFaollik: OxirgiFaollik | null;
  faolSoniya: number;
  radioSoniya: number;
  kirdi: boolean;
  shugullanganKunlar: number;
  maxraj: number;
  hisobBoshi: string;
  kunlar: KunSurati[];
  mashq: { savollar: number; togri: number; foiz: number | null };
  kurs: JoriyDaraja;
}

export interface GuruhKartalari {
  oquvchilar: number;
  akkauntlar: number;
  kirganlar: number;
  ortachaFaolSoniya: number | null;
  savollar: number;
  foiz: number | null;
  tugatilganDarslar: number;
  radioSoniya: number;
  radioTinglaganlar: number;
}

export interface GuruhQiyinElement extends QiyinElement {
  de: string;
  uz: string | null;
}

export interface GuruhFaolligi {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  guruhDarajasi: Daraja | null;
  kartalar: GuruhKartalari;
  oquvchilar: GuruhOquvchiQatori[];
  qiyinElementlar: GuruhQiyinElement[];
}

export interface OquvchiBolimi {
  unitId: number;
  nomi: string;
  tugatilgan: number;
  jami: number;
}

export interface OquvchiFaolligi {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  studentId: number;
  ism: string;
  photo: string | null;
  akkaunt: boolean;
  hisobBoshi: string;
  maxraj: number;
  oxirgiFaollik: OxirgiFaollik | null;
  fortschritt: { gesamt: number; stufe: { de: string; uz: string }; serie: number };
  vaqt: {
    faolSoniya: number;
    radioSoniya: number;
    kirdi: boolean;
    platforma: Record<Platforma, number>;
    bolim: { LERNEN: number; OTHER: number };
  };
  shugullanganKunlar: number;
  /** Har doim oxirgi 30 kun (davrdan qat'i nazar). */
  xarita: KunSurati[];
  mashq: {
    savollar: number;
    togri: number;
    xatolar: number;
    foiz: number | null;
    konikmalar: KonikmaNatijasi[];
  };
  darajalar: (DarajaQatori & { tugatilganSana: string | null })[];
  joriyDaraja: JoriyDaraja;
  bolimlar: OquvchiBolimi[];
  sozlar: { mustahkam: number; organilmoqda: number; yangi: number; bugunTakror: number };
  qiyinSozlar: { lexemeId: number; de: string; uz: string | null; xatolar: number }[];
  seanslar: {
    id: string;
    tur: 'LESSON' | 'REVIEW';
    darsNomi: string | null;
    boshlandi: string;
    tugadi: string;
    savollar: number;
    togri: number;
  }[];
}
```

- [ ] **Step 2: Failing tests** — `app-activity-stats.service.spec.ts`. Soxta Prisma: har metod `jest.fn`, `$queryRaw` SQL matniga qarab javob beradi; so'rovlar soni barcha mock chaqiruvlari yig'indisi.

```ts
import { NotFoundException } from '@nestjs/common';
import { AppActivityStatsService } from './app-activity-stats.service';

const NOW = new Date('2026-09-13T05:00:00Z');

function soxtaPrisma(oquvchiSoni: number) {
  const ids = Array.from({ length: oquvchiSoni }, (_, i) => 10001 + i);
  const raw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('"DafAttempt"') && sql.includes('HAVING')) {
      return Promise.resolve([
        { itemType: 'WORT', itemId: 7, oquvchilar: 3, ortachaBall: 0.25, format: 'WORT_UZ' },
      ]);
    }
    if (sql.includes('COUNT(l.id)')) return Promise.resolve([{ daraja: 'A1', jami: 192 }]);
    return Promise.resolve([]);
  });
  const prisma = {
    group: { findFirst: jest.fn().mockResolvedValue({ level: 'A1' }) },
    enrollment: {
      findMany: jest.fn().mockResolvedValue(
        ids.map((id) => ({
          student: {
            id,
            firstName: 'Ali',
            lastName: `N${id}`,
            photo: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            user: { createdAt: new Date('2026-01-01T00:00:00Z') },
          },
        })),
      ),
      findFirst: jest.fn(),
    },
    studentAppSession: {
      aggregate: jest.fn().mockResolvedValue({ _min: { day: new Date('2026-09-01T00:00:00Z') } }),
      findMany: jest.fn().mockResolvedValue(
        ids.map((studentId) => ({
          studentId,
          day: new Date('2026-09-13T00:00:00Z'),
          firstSeenAt: new Date('2026-09-13T04:00:00Z'),
          lastSeenAt: new Date('2026-09-13T04:30:00Z'),
          activeSeconds: 600,
          radioSeconds: 0,
          platform: 'WEB',
          sections: { LERNEN: 600 },
        })),
      ),
    },
    dafAttempt: {
      findMany: jest.fn().mockResolvedValue(
        ids.map((studentId) => ({
          studentId,
          createdAt: new Date('2026-09-13T04:10:00Z'),
          sessionId: `s${studentId}`,
          questionIndex: 0,
          attemptNo: 1,
          format: 'WORT_UZ',
          score: 1,
          gradingStatus: 'GRADED',
        })),
      ),
    },
    dafSession: { findMany: jest.fn().mockResolvedValue([]) },
    dafLexeme: { findMany: jest.fn().mockResolvedValue([{ id: 7, de: 'der Tisch', uz: 'stol' }]) },
    dafSentence: { findMany: jest.fn().mockResolvedValue([]) },
    dafPhrase: { findMany: jest.fn().mockResolvedValue([]) },
    dafDialogLine: { findMany: jest.fn().mockResolvedValue([]) },
    dafHoerFrage: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: raw,
  };
  return prisma;
}

function soroqlarSoni(prisma: ReturnType<typeof soxtaPrisma>): number {
  let jami = prisma.$queryRaw.mock.calls.length;
  for (const [kalit, model] of Object.entries(prisma)) {
    if (kalit.startsWith('$')) continue;
    for (const fn of Object.values(model as Record<string, jest.Mock>)) jami += fn.mock.calls.length;
  }
  return jami;
}

const fortschritt = {
  uebersicht: jest.fn().mockResolvedValue({
    gesamt: 120,
    stufe: { de: 'Anfänger', uz: 'Boshlovchi', ab: 0 },
    naechsteStufe: null,
    serie: 3,
    wochePunkte: 0,
    wochePlatzGruppe: null,
    wochePlatzZentrum: 1,
    faelligeWoerter: 4,
  }),
};

describe('AppActivityStatsService.guruhFaolligi', () => {
  it('so`rovlar soni o`quvchilar soniga bog`liq emas (dizayn 6.6)', async () => {
    const bir = soxtaPrisma(1);
    await new AppActivityStatsService(bir as never, fortschritt as never).guruhFaolligi('g1', 1, 7, NOW);
    const yigirma = soxtaPrisma(20);
    await new AppActivityStatsService(yigirma as never, fortschritt as never).guruhFaolligi('g1', 1, 7, NOW);
    expect(soroqlarSoni(yigirma)).toBe(soroqlarSoni(bir));
  });

  it('qator va kartalar bitta ta`rifdan', async () => {
    const prisma = soxtaPrisma(3);
    const n = await new AppActivityStatsService(prisma as never, fortschritt as never).guruhFaolligi('g1', 1, 7, NOW);
    expect(n.oquvchilar).toHaveLength(3);
    expect(n.oquvchilar[0]).toMatchObject({
      akkaunt: true,
      faolSoniya: 600,
      kirdi: true,
      shugullanganKunlar: 1,
      mashq: { savollar: 1, togri: 1, foiz: 100 },
      kurs: { daraja: 'A1', jami: 192, tugatilgan: 0, holat: 'BOSHLANMAGAN' },
    });
    expect(n.kartalar).toMatchObject({ oquvchilar: 3, kirganlar: 3, ortachaFaolSoniya: 600, savollar: 3, foiz: 100 });
    expect(n.qiyinElementlar).toEqual([
      expect.objectContaining({ itemId: 7, de: 'der Tisch', uz: 'stol', xatoFoizi: 75, konikma: 'WORTSCHATZ' }),
    ]);
  });

  it('guruh topilmasa 404', async () => {
    const prisma = soxtaPrisma(1);
    prisma.group.findFirst.mockResolvedValue(null);
    await expect(
      new AppActivityStatsService(prisma as never, fortschritt as never).guruhFaolligi('g1', 1, 7, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bo`sh guruh — bo`sh ro`yxat, xatosiz', async () => {
    const prisma = soxtaPrisma(0);
    const n = await new AppActivityStatsService(prisma as never, fortschritt as never).guruhFaolligi('g1', 1, 7, NOW);
    expect(n.oquvchilar).toEqual([]);
    expect(n.kartalar.kirganlar).toBe(0);
  });
});

describe('AppActivityStatsService.guruhAzosiEkaniniTekshir', () => {
  it('faol a`zo bo`lmasa 404', async () => {
    const prisma = soxtaPrisma(1);
    prisma.enrollment.findFirst.mockResolvedValue(null);
    await expect(
      new AppActivityStatsService(prisma as never, fortschritt as never).guruhAzosiEkaniniTekshir('g1', 10001),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith({
      where: { groupId: 'g1', studentId: 10001, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
  });
});
```

```ts
describe('AppActivityStatsService.oquvchiFaolligi', () => {
  function oquvchiPrisma(akkaunt: boolean) {
    const p = soxtaPrisma(1) as ReturnType<typeof soxtaPrisma> & Record<string, unknown>;
    Object.assign(p, {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10001,
          firstName: 'Ali',
          lastName: 'Valiyev',
          photo: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          user: akkaunt ? { createdAt: new Date('2026-01-01T00:00:00Z') } : null,
        }),
      },
      dafLexemeState: {
        findMany: jest.fn().mockResolvedValue([
          { lexemeId: 7, wrongCount: 4, lexeme: { de: 'der Tisch', uz: 'stol' } },
        ]),
      },
      dafLesson: {
        findMany: jest.fn().mockResolvedValue([{ id: 3, titleUz: 'Salomlashish', titleDe: 'Begrüßung' }]),
      },
    });
    p.dafSession.findMany.mockResolvedValue([
      {
        id: 's1', kind: 'LESSON', lessonId: 3,
        startedAt: new Date('2026-09-13T04:00:00Z'),
        finishedAt: new Date('2026-09-13T04:12:00Z'),
        questionCount: 12, firstTryCorrect: 9,
      },
    ]);
    p.$queryRaw.mockImplementation(((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('FROM "DafLexemeState"')) {
        return Promise.resolve([{ mustahkam: 5, organilmoqda: 3, yangi: 2 }]);
      }
      if (sql.includes('LEFT JOIN "DafLessonProgress"')) {
        return Promise.resolve([
          { unitId: 1, daraja: 'A1', nomi: 'Salom', jami: 16, tugatilgan: 16, oxirgi: new Date('2026-09-10T10:00:00Z') },
          { unitId: 2, daraja: 'A1', nomi: 'Oila', jami: 16, tugatilgan: 4, oxirgi: new Date('2026-09-12T10:00:00Z') },
        ]);
      }
      return Promise.resolve([]);
    }) as never);
    return p;
  }

  it('panel ma`lumoti bitta javobda', async () => {
    const p = oquvchiPrisma(true);
    const n = await new AppActivityStatsService(p as never, fortschritt as never).oquvchiFaolligi(10001, 1, 7, NOW);
    expect(n).toMatchObject({
      akkaunt: true,
      ism: 'Ali Valiyev',
      fortschritt: { gesamt: 120, serie: 3 },
      vaqt: { faolSoniya: 600, bolim: { LERNEN: 600, OTHER: 0 } },
      mashq: { savollar: 1, togri: 1, foiz: 100 },
      joriyDaraja: { daraja: 'A1', tugatilgan: 20, jami: 32, holat: 'DAVOM' },
      sozlar: { mustahkam: 5, organilmoqda: 3, yangi: 2, bugunTakror: 4 },
      qiyinSozlar: [{ lexemeId: 7, de: 'der Tisch', uz: 'stol', xatolar: 4 }],
      seanslar: [expect.objectContaining({ tur: 'LESSON', darsNomi: 'Salomlashish', savollar: 12, togri: 9 })],
    });
    expect(n.xarita).toHaveLength(30);
    expect(n.bolimlar).toEqual([
      { unitId: 1, nomi: 'Salom', tugatilgan: 16, jami: 16 },
      { unitId: 2, nomi: 'Oila', tugatilgan: 4, jami: 16 },
    ]);
    expect(n.darajalar[0]).toMatchObject({ daraja: 'A1', holat: 'DAVOM', tugatilganSana: null });
  });

  it('akkauntsiz o`quvchi', async () => {
    const n = await new AppActivityStatsService(oquvchiPrisma(false) as never, fortschritt as never).oquvchiFaolligi(10001, 1, 7, NOW);
    expect(n.akkaunt).toBe(false);
  });

  it('o`quvchi topilmasa 404', async () => {
    const p = oquvchiPrisma(true);
    (p.student as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
    await expect(
      new AppActivityStatsService(p as never, fortschritt as never).oquvchiFaolligi(10001, 1, 7, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('guruhTartibi', () => {
  it('faol vaqt kamayishi; kirmaganlar, keyin akkauntsizlar pastda', () => {
    const q = (ism: string, akkaunt: boolean, kirdi: boolean, faolSoniya: number) =>
      ({ ism, akkaunt, kirdi, faolSoniya }) as never;
    const royxat = [q('D', false, false, 0), q('C', true, false, 0), q('A', true, true, 60), q('B', true, true, 900)];
    expect(royxat.sort(guruhTartibi).map((x: { ism: string }) => x.ism)).toEqual(['B', 'A', 'C', 'D']);
  });
});
```

(`guruhTartibi` ni spec boshida `import { AppActivityStatsService, guruhTartibi } from './app-activity-stats.service';` bilan import qiling.)

- [ ] **Step 3: Run** `npx jest src/app-activity/app-activity-stats.service.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement** — `app-activity-stats.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  addDaysToDateStr,
  tashkentDayStartUtc,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { FortschrittService } from '../daf/fortschritt/fortschritt.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  GuruhFaolligi,
  GuruhOquvchiQatori,
  GuruhQiyinElement,
  OquvchiFaolligi,
  OxirgiFaollik,
} from './app-activity-stats.types';
import { Daraja, darajaQatorlari, guruhDarajasi, joriyDaraja } from './stats/daraja';
import { Davr, davrOynasi } from './stats/davr';
import { davrSurati } from './stats/davr-surati';
import { dayStr, Platforma, SeansSatri } from './stats/kunlik-faollik';
import { foizi, MashqUrinishi } from './stats/mashq-natijasi';
import { ElementAgregati, qiyinElementlar } from './stats/qiyin-elementlar';

const XARITA_KUNLARI = 30;

const seansSelect = {
  studentId: true,
  day: true,
  firstSeenAt: true,
  lastSeenAt: true,
  activeSeconds: true,
  radioSeconds: true,
  platform: true,
  sections: true,
} as const;

const urinishSelect = {
  studentId: true,
  createdAt: true,
  sessionId: true,
  questionIndex: true,
  attemptNo: true,
  format: true,
  score: true,
  gradingStatus: true,
} as const;

type Sonlar = Partial<Record<Daraja, number>>;

/**
 * Ilova faolligi statistikasi (dizayn 6). Guruh endpointi o'quvchilar soniga
 * bog'liq bo'lmagan, o'zgarmas sondagi so'rov bilan ishlaydi — o'quvchi
 * bo'yicha sikl ichida so'rov YO'Q (dizayn 6.6, test qayd etadi).
 */
@Injectable()
export class AppActivityStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fortschritt: FortschrittService,
  ) {}

  async guruhAzosiEkaniniTekshir(groupId: string, studentId: number): Promise<void> {
    const azo = await this.prisma.enrollment.findFirst({
      where: { groupId, studentId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!azo) throw new NotFoundException("O'quvchi bu guruhning faol a'zosi emas");
  }

  async guruhFaolligi(
    groupId: string,
    companyId: number,
    davr: Davr,
    now: Date,
  ): Promise<GuruhFaolligi> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, companyId, deletedAt: null },
      select: { level: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const gDaraja = guruhDarajasi(group.level);

    const [azolar, kuzatuvBoshi] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { groupId, status: 'ACTIVE', deletedAt: null },
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              createdAt: true,
              user: { select: { createdAt: true } },
            },
          },
        },
      }),
      this.kuzatuvBoshi(companyId),
    ]);
    const oquvchilarXom = [...new Map(azolar.map((a) => [a.student.id, a.student])).values()];
    const ids = oquvchilarXom.map((s) => s.id);
    const bosh = davrOynasi(davr, now, now, null);

    if (ids.length === 0) {
      return {
        davr,
        bugun: bosh.bugun,
        kuzatuvBoshi,
        guruhDarajasi: gDaraja,
        kartalar: {
          oquvchilar: 0, akkauntlar: 0, kirganlar: 0, ortachaFaolSoniya: null,
          savollar: 0, foiz: null, tugatilganDarslar: 0, radioSoniya: 0, radioTinglaganlar: 0,
        },
        oquvchilar: [],
        qiyinElementlar: [],
      };
    }

    const [seanslar, oxirgilar, urinishlar, jami, tugatilganlar, oxirgiDarajalar, darslar, agregatlar] =
      await Promise.all([
        this.prisma.studentAppSession.findMany({
          where: {
            studentId: { in: ids },
            day: { gte: utcMidnightFromDateStr(bosh.davrBoshi), lte: utcMidnightFromDateStr(bosh.bugun) },
          },
          select: seansSelect,
        }),
        this.oxirgiFaolliklar(ids),
        this.prisma.dafAttempt.findMany({
          where: { studentId: { in: ids }, companyId, createdAt: { gte: tashkentDayStartUtc(bosh.davrBoshi) } },
          select: urinishSelect,
        }),
        this.kursJamisi(),
        this.tugatilganDarslar(ids),
        this.oxirgiDarsDarajalari(ids),
        this.prisma.dafSession.findMany({
          where: {
            studentId: { in: ids },
            kind: 'LESSON',
            lessonId: { not: null },
            finishedAt: { gte: tashkentDayStartUtc(bosh.davrBoshi) },
          },
          select: { studentId: true, lessonId: true },
        }),
        this.elementAgregatlari(ids, tashkentDayStartUtc(bosh.davrBoshi)),
      ]);

    const seansMap = guruhla(seanslar, (s) => s.studentId);
    const urinishMap = guruhla(urinishlar, (u) => u.studentId);
    const darsMap = guruhla(darslar, (d) => d.studentId);
    // ↓ metodning davomi keyingi blokda (bitta metod, ikki blokka bo'lingan)
```

`guruhFaolligi` davomi (xuddi shu metod ichida, `darsMap` dan keyin):

```ts
    const qatorlar: GuruhOquvchiQatori[] = [];
    let tugatilganDarslar = 0;
    for (const s of oquvchilarXom) {
      const oyna = davrOynasi(davr, now, s.user?.createdAt ?? s.createdAt, kuzatuvBoshi);
      const surat = davrSurati(
        oyna,
        (seansMap.get(s.id) ?? []).map(seansSatri),
        (urinishMap.get(s.id) ?? []) as MashqUrinishi[],
      );
      tugatilganDarslar += new Set((darsMap.get(s.id) ?? []).map((d) => d.lessonId)).size;
      qatorlar.push({
        studentId: s.id,
        ism: `${s.firstName} ${s.lastName}`.trim(),
        photo: s.photo,
        akkaunt: s.user !== null,
        oxirgiFaollik: oxirgilar.get(s.id) ?? null,
        faolSoniya: surat.faolSoniya,
        radioSoniya: surat.radioSoniya,
        kirdi: surat.kirdi,
        shugullanganKunlar: surat.shugullanganKunlar,
        maxraj: oyna.maxraj,
        hisobBoshi: oyna.hisobBoshi,
        kunlar: surat.kunlar,
        mashq: { savollar: surat.mashq.savollar, togri: surat.mashq.togri, foiz: surat.mashq.foiz },
        kurs: joriyDaraja({
          oxirgiDarsDarajasi: oxirgiDarajalar.get(s.id) ?? null,
          guruhDarajasi: gDaraja,
          tugatilgan: tugatilganlar.get(s.id) ?? {},
          jami,
        }),
      });
    }
    qatorlar.sort(guruhTartibi);

    const kirganlar = qatorlar.filter((q) => q.kirdi);
    const savollar = qatorlar.reduce((j, q) => j + q.mashq.savollar, 0);
    const togri = qatorlar.reduce((j, q) => j + q.mashq.togri, 0);

    return {
      davr,
      bugun: bosh.bugun,
      kuzatuvBoshi,
      guruhDarajasi: gDaraja,
      kartalar: {
        oquvchilar: qatorlar.length,
        akkauntlar: qatorlar.filter((q) => q.akkaunt).length,
        kirganlar: kirganlar.length,
        ortachaFaolSoniya: kirganlar.length
          ? Math.round(kirganlar.reduce((j, q) => j + q.faolSoniya, 0) / kirganlar.length)
          : null,
        savollar,
        foiz: foizi(togri, savollar),
        tugatilganDarslar,
        radioSoniya: qatorlar.reduce((j, q) => j + q.radioSoniya, 0),
        radioTinglaganlar: qatorlar.filter((q) => q.radioSoniya > 0).length,
      },
      oquvchilar: qatorlar,
      qiyinElementlar: await this.elementMatnlari(qiyinElementlar(agregatlar)),
    };
  }
```

Metodning qolgan qismi va yordamchilar (klass ichida va fayl oxirida):

```ts
  async oquvchiFaolligi(
    studentId: number,
    companyId: number,
    davr: Davr,
    now: Date,
  ): Promise<OquvchiFaolligi> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photo: true,
        createdAt: true,
        user: { select: { createdAt: true } },
      },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const kuzatuvBoshi = await this.kuzatuvBoshi(companyId);
    const akkauntKuni = student.user?.createdAt ?? student.createdAt;
    const oyna = davrOynasi(davr, now, akkauntKuni, kuzatuvBoshi);
    const xaritaOynasi = davrOynasi(XARITA_KUNLARI, now, akkauntKuni, kuzatuvBoshi);
    const boshlanish = tashkentDayStartUtc(xaritaOynasi.davrBoshi);

    const [seanslar, oxirgilar, urinishlar, fortschritt, birliklar, oxirgiDarajalar, sozQatorlari, qiyin, seansTarixi] =
      await Promise.all([
        this.prisma.studentAppSession.findMany({
          where: {
            studentId,
            day: { gte: utcMidnightFromDateStr(xaritaOynasi.davrBoshi), lte: utcMidnightFromDateStr(oyna.bugun) },
          },
          select: seansSelect,
        }),
        this.oxirgiFaolliklar([studentId]),
        this.prisma.dafAttempt.findMany({
          where: { studentId, companyId, createdAt: { gte: boshlanish } },
          select: urinishSelect,
        }),
        this.fortschritt.uebersicht(studentId, companyId),
        this.birlikProgressi(studentId),
        this.oxirgiDarsDarajalari([studentId]),
        this.prisma.$queryRaw<{ mustahkam: number; organilmoqda: number; yangi: number }[]>`
          SELECT
            COUNT(*) FILTER (WHERE s.strength >= 3)::int AS mustahkam,
            COUNT(*) FILTER (WHERE s.strength BETWEEN 1 AND 2)::int AS organilmoqda,
            COUNT(*) FILTER (WHERE s.strength <= 0)::int AS yangi
          FROM "DafLexemeState" s
          WHERE s."studentId" = ${studentId}
        `,
        this.prisma.dafLexemeState.findMany({
          where: { studentId, strength: { lte: 2 }, wrongCount: { gt: 0 } },
          orderBy: [{ wrongCount: 'desc' }, { lastSeenAt: 'desc' }],
          take: 5,
          select: { lexemeId: true, wrongCount: true, lexeme: { select: { de: true, uz: true } } },
        }),
        this.prisma.dafSession.findMany({
          where: { studentId, finishedAt: { not: null, gte: tashkentDayStartUtc(oyna.davrBoshi) } },
          orderBy: { finishedAt: 'desc' },
          take: 10,
          select: {
            id: true, kind: true, lessonId: true, startedAt: true, finishedAt: true,
            questionCount: true, firstTryCorrect: true,
          },
        }),
      ]);

    const seansSatrlari = seanslar.map(seansSatri);
    const surat = davrSurati(oyna, seansSatrlari, urinishlar as MashqUrinishi[]);
    const xarita = davrSurati(xaritaOynasi, seansSatrlari, urinishlar as MashqUrinishi[]).kunlar;

    const tugatilgan: Sonlar = {};
    const jami: Sonlar = {};
    const oxirgiSana: Partial<Record<Daraja, Date>> = {};
    for (const b of birliklar) {
      tugatilgan[b.daraja] = (tugatilgan[b.daraja] ?? 0) + b.tugatilgan;
      jami[b.daraja] = (jami[b.daraja] ?? 0) + b.jami;
      if (b.oxirgi && (!oxirgiSana[b.daraja] || b.oxirgi > oxirgiSana[b.daraja]!)) oxirgiSana[b.daraja] = b.oxirgi;
    }
    const joriy = joriyDaraja({
      oxirgiDarsDarajasi: oxirgiDarajalar.get(studentId) ?? null,
      guruhDarajasi: null,
      tugatilgan,
      jami,
    });

    const darsIds = [...new Set(seansTarixi.map((s) => s.lessonId).filter((id): id is number => id !== null))];
    const darslar = darsIds.length
      ? await this.prisma.dafLesson.findMany({ where: { id: { in: darsIds } }, select: { id: true, titleUz: true, titleDe: true } })
      : [];
    const darsNomi = new Map(darslar.map((d) => [d.id, d.titleUz ?? d.titleDe]));
    const soz = sozQatorlari[0] ?? { mustahkam: 0, organilmoqda: 0, yangi: 0 };

    return {
      davr,
      bugun: oyna.bugun,
      kuzatuvBoshi,
      studentId: student.id,
      ism: `${student.firstName} ${student.lastName}`.trim(),
      photo: student.photo,
      akkaunt: student.user !== null,
      hisobBoshi: oyna.hisobBoshi,
      maxraj: oyna.maxraj,
      oxirgiFaollik: oxirgilar.get(studentId) ?? null,
      fortschritt: {
        gesamt: fortschritt.gesamt,
        stufe: { de: fortschritt.stufe.de, uz: fortschritt.stufe.uz },
        serie: fortschritt.serie,
      },
      vaqt: {
        faolSoniya: surat.faolSoniya,
        radioSoniya: surat.radioSoniya,
        kirdi: surat.kirdi,
        platforma: surat.platforma,
        bolim: surat.bolim,
      },
      shugullanganKunlar: surat.shugullanganKunlar,
      xarita,
      mashq: {
        savollar: surat.mashq.savollar,
        togri: surat.mashq.togri,
        xatolar: surat.mashq.xatolar,
        foiz: surat.mashq.foiz,
        konikmalar: surat.mashq.konikmalar,
      },
      darajalar: darajaQatorlari(tugatilgan, jami).map((q) => ({
        ...q,
        tugatilganSana: q.holat === 'TUGATILGAN' && oxirgiSana[q.daraja] ? oxirgiSana[q.daraja]!.toISOString() : null,
      })),
      joriyDaraja: joriy,
      bolimlar: birliklar
        .filter((b) => b.daraja === joriy.daraja)
        .map((b) => ({ unitId: b.unitId, nomi: b.nomi, tugatilgan: b.tugatilgan, jami: b.jami })),
      sozlar: { ...soz, bugunTakror: fortschritt.faelligeWoerter },
      qiyinSozlar: qiyin.map((q) => ({ lexemeId: q.lexemeId, de: q.lexeme.de, uz: q.lexeme.uz, xatolar: q.wrongCount })),
      seanslar: seansTarixi.map((s) => ({
        id: s.id,
        tur: s.kind,
        darsNomi: s.lessonId !== null ? (darsNomi.get(s.lessonId) ?? null) : null,
        boshlandi: s.startedAt.toISOString(),
        tugadi: s.finishedAt!.toISOString(),
        savollar: s.questionCount ?? 0,
        togri: s.firstTryCorrect ?? 0,
      })),
    };
  }

  /** Kompaniyadagi eng birinchi `StudentAppSession.day` (dizayn 6.2). */
  private async kuzatuvBoshi(companyId: number): Promise<string | null> {
    const r = await this.prisma.studentAppSession.aggregate({
      where: { companyId },
      _min: { day: true },
    });
    return r._min.day ? dayStr(r._min.day) : null;
  }

  private async oxirgiFaolliklar(ids: number[]): Promise<Map<number, OxirgiFaollik>> {
    const rows = await this.prisma.$queryRaw<{ studentId: number; lastSeenAt: Date; platform: Platforma }[]>`
      SELECT DISTINCT ON ("studentId") "studentId", "lastSeenAt", "platform"::text AS "platform"
      FROM "StudentAppSession"
      WHERE "studentId" IN (${Prisma.join(ids)})
      ORDER BY "studentId", "lastSeenAt" DESC
    `;
    return new Map(rows.map((r) => [r.studentId, { vaqt: r.lastSeenAt.toISOString(), platforma: r.platform }]));
  }

  /** Darajadagi kurs darslari soni (dizayn 3: kurs ta'rifi). */
  private async kursJamisi(): Promise<Sonlar> {
    const rows = await this.prisma.$queryRaw<{ daraja: Daraja; jami: number }[]>`
      SELECT u.level::text AS daraja, COUNT(l.id)::int AS jami
      FROM "DafLesson" l
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY u.level
    `;
    return Object.fromEntries(rows.map((r) => [r.daraja, r.jami]));
  }

  private async tugatilganDarslar(ids: number[]): Promise<Map<number, Sonlar>> {
    const rows = await this.prisma.$queryRaw<{ studentId: number; daraja: Daraja; soni: number }[]>`
      SELECT p."studentId", u.level::text AS daraja, COUNT(*)::int AS soni
      FROM "DafLessonProgress" p
      JOIN "DafLesson" l ON l.id = p."lessonId"
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE p."studentId" IN (${Prisma.join(ids)})
        AND p."completedAt" IS NOT NULL
        AND u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY p."studentId", u.level
    `;
    const natija = new Map<number, Sonlar>();
    for (const r of rows) {
      const s = natija.get(r.studentId) ?? {};
      s[r.daraja] = r.soni;
      natija.set(r.studentId, s);
    }
    return natija;
  }

  private async oxirgiDarsDarajalari(ids: number[]): Promise<Map<number, Daraja>> {
    const rows = await this.prisma.$queryRaw<{ studentId: number; daraja: Daraja }[]>`
      SELECT DISTINCT ON (s."studentId") s."studentId", u.level::text AS daraja
      FROM "DafSession" s
      JOIN "DafLesson" l ON l.id = s."lessonId"
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE s."studentId" IN (${Prisma.join(ids)}) AND s.kind = 'LESSON'
      ORDER BY s."studentId", s."startedAt" DESC
    `;
    return new Map(rows.map((r) => [r.studentId, r.daraja]));
  }

  private async birlikProgressi(studentId: number) {
    return this.prisma.$queryRaw<
      { unitId: number; daraja: Daraja; nomi: string; jami: number; tugatilgan: number; oxirgi: Date | null }[]
    >`
      SELECT u.id AS "unitId", u.level::text AS daraja, u."titleUz" AS nomi,
        COUNT(l.id)::int AS jami,
        COUNT(p.id) FILTER (WHERE p."completedAt" IS NOT NULL)::int AS tugatilgan,
        MAX(p."completedAt") AS oxirgi
      FROM "DafUnit" u
      JOIN "DafLesson" l ON l."unitId" = u.id
      LEFT JOIN "DafLessonProgress" p ON p."lessonId" = l.id AND p."studentId" = ${studentId}
      WHERE u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY u.id
      ORDER BY u.level, u."order"
    `;
  }

  /** Dizayn 6.5: birinchi urinishlar `(itemType, itemId)` bo'yicha; kamida 3 o'quvchi SQL da. */
  private async elementAgregatlari(ids: number[], dan: Date): Promise<ElementAgregati[]> {
    return this.prisma.$queryRaw<ElementAgregati[]>`
      SELECT "itemType", "itemId",
        COUNT(DISTINCT "studentId")::int AS oquvchilar,
        AVG(COALESCE(score, 0))::float AS "ortachaBall",
        MODE() WITHIN GROUP (ORDER BY format) AS format
      FROM "DafAttempt"
      WHERE "studentId" IN (${Prisma.join(ids)})
        AND "attemptNo" = 1 AND "gradingStatus" = 'GRADED'
        AND "itemType" IS NOT NULL AND "itemId" IS NOT NULL
        AND "createdAt" >= ${dan}
      GROUP BY "itemType", "itemId"
      HAVING COUNT(DISTINCT "studentId") >= 3
    `;
  }

  /** Har material turi uchun bittadan so'rov (≤ 5, o'quvchilar soniga bog'liq emas). */
  private async elementMatnlari(
    elementlar: ReturnType<typeof qiyinElementlar>,
  ): Promise<GuruhQiyinElement[]> {
    const idlar = (tur: string) => elementlar.filter((e) => e.itemType === tur).map((e) => e.itemId);
    const matn = new Map<string, { de: string; uz: string | null }>();
    const qosh = (tur: string, rows: { id: number; de: string; uz: string | null }[]) => {
      for (const r of rows) matn.set(`${tur}:${r.id}`, { de: r.de, uz: r.uz });
    };
    const wort = idlar('WORT');
    const satz = idlar('SATZ');
    const phrase = idlar('PHRASE');
    const zeile = idlar('DIALOGZEILE');
    const hoer = idlar('HOERFRAGE');
    await Promise.all([
      wort.length && this.prisma.dafLexeme.findMany({ where: { id: { in: wort } }, select: { id: true, de: true, uz: true } }).then((r) => qosh('WORT', r)),
      satz.length && this.prisma.dafSentence.findMany({ where: { id: { in: satz } }, select: { id: true, de: true, uz: true } }).then((r) => qosh('SATZ', r)),
      phrase.length && this.prisma.dafPhrase.findMany({ where: { id: { in: phrase } }, select: { id: true, de: true, uz: true } }).then((r) => qosh('PHRASE', r)),
      zeile.length && this.prisma.dafDialogLine.findMany({ where: { id: { in: zeile } }, select: { id: true, de: true, uz: true } }).then((r) => qosh('DIALOGZEILE', r)),
      hoer.length && this.prisma.dafHoerFrage.findMany({ where: { id: { in: hoer } }, select: { id: true, frageDe: true, frageUz: true } }).then((r) => qosh('HOERFRAGE', r.map((x) => ({ id: x.id, de: x.frageDe, uz: x.frageUz })))),
    ]);
    return elementlar
      .map((e) => ({ ...e, ...(matn.get(`${e.itemType}:${e.itemId}`) ?? { de: '', uz: null }) }))
      .filter((e) => e.de !== '');
  }
}

function guruhla<T>(rows: T[], kalit: (r: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const r of rows) {
    const k = kalit(r);
    const royxat = m.get(k) ?? [];
    royxat.push(r);
    m.set(k, royxat);
  }
  return m;
}

function seansSatri(s: {
  day: Date; firstSeenAt: Date; lastSeenAt: Date; activeSeconds: number;
  radioSeconds: number; platform: Platforma; sections: unknown;
}): SeansSatri {
  return {
    day: dayStr(s.day),
    firstSeenAt: s.firstSeenAt,
    lastSeenAt: s.lastSeenAt,
    activeSeconds: s.activeSeconds,
    radioSeconds: s.radioSeconds,
    platform: s.platform,
    sections: s.sections,
  };
}

/** Dizayn 7: faol vaqt kamayishi; kirmaganlar, keyin akkauntsizlar pastda; teng bo'lsa ism. */
export function guruhTartibi(a: GuruhOquvchiQatori, b: GuruhOquvchiQatori): number {
  const daraja = (q: GuruhOquvchiQatori) => (!q.akkaunt ? 2 : q.kirdi ? 0 : 1);
  return daraja(a) - daraja(b) || b.faolSoniya - a.faolSoniya || a.ism.localeCompare(b.ism);
}
```

Muhim eslatmalar implementatsiya uchun:
- `addDaysToDateStr` ishlatilmaydi — importga qo'shmang (eslint).
- `Promise.all` ichidagi `x.length && promise` — `0` qaytsa ham `Promise.all` uni qabul qiladi; eslint `no-floating-promises`/`@typescript-eslint` e'tiroz bildirsa, `if (x.length) vazifalar.push(...)` shakliga o'tkazing.
- `guruhTartibi` uchun alohida test qo'shing: akkauntsiz pastda, kirmagan o'rtada, faol vaqt kamayishi.
- `$queryRaw` natijasidagi `platform` enum emas, matn (`::text`) — tip `Platforma`.

`app-activity.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DafModule } from '../daf/daf.module';
import { StudentActivityController } from './student-activity.controller';
import { AppActivityWriteService } from './app-activity-write.service';
import { AppActivityStatsService } from './app-activity-stats.service';

@Module({
  imports: [DafModule],
  controllers: [StudentActivityController],
  providers: [AppActivityWriteService, AppActivityStatsService],
  exports: [AppActivityWriteService],
})
export class AppActivityModule {}
```

- [ ] **Step 5: Run** `npx jest src/app-activity` — Expected: PASS.
- [ ] **Step 6: Dev bazada qo'lda tekshirish** — skript yozmasdan: `npx ts-node -e` bilan xizmatni ishga tushirish murakkab bo'lsa, bu tekshiruv Task 5 dan keyin HTTP orqali qilinadi. Hozir faqat `npm run typecheck`.
- [ ] **Step 7: Verify & commit** — `npm test && npm run typecheck && npx eslint src`

```bash
git add server/src/app-activity
git commit -m "Ilova faolligi statistikasi servisi: guruh va o'quvchi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Route'lar, qorovullar, manifest

**Files:**
- Create: `server/src/app-activity/dto/app-activity-query.dto.ts`
- Create: `server/src/app-activity/group-app-activity.controller.ts` (+ `.spec.ts`)
- Create: `server/src/app-activity/student-app-activity.controller.ts` (+ `.spec.ts`)
- Modify: `server/src/app-activity/app-activity.module.ts` (controllers)
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: Task 4 servis; `assertCallerMayTouchGroup(prisma, userId, roles, groupId, message)` (`common/auth/group-branch-scope.ts`); `assertCallerMayTouchStudent(prisma, userId, studentId, companyId)` (`common/auth/student-branch-scope.ts`); `CurrentUser`, `Roles` (`common/decorators`); `RolesGuard` (`common/guards/roles.guard`); `davrniOqi` (Task 2).
- Produces: `GET /groups/:id/app-activity?period=7|30`, `GET /groups/:id/app-activity/students/:studentId?period=`, `GET /students/:id/app-activity?period=`.

- [ ] **Step 1: DTO**

```ts
import { IsIn, IsOptional } from 'class-validator';

export class AppActivityQueryDto {
  @IsOptional()
  @IsIn(['7', '30'])
  period?: string;
}
```

- [ ] **Step 2: Failing controller tests** — `group-app-activity.controller.spec.ts` (`groups.controller.spec.ts` dagi `mockExecutionContext` + haqiqiy `Reflector`/`RolesGuard` usulida):

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import * as groupScope from '../common/auth/group-branch-scope';
import { GroupAppActivityController } from './group-app-activity.controller';

jest.mock('../common/auth/group-branch-scope');

function mockExecutionContext(handler: unknown, roles: string[]) {
  return {
    getHandler: () => handler,
    getClass: () => GroupAppActivityController,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  } as never;
}

describe('GroupAppActivityController', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const prisma = {};
  const stats = {
    guruhFaolligi: jest.fn().mockResolvedValue({ ok: 1 }),
    oquvchiFaolligi: jest.fn().mockResolvedValue({ ok: 2 }),
    guruhAzosiEkaniniTekshir: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new GroupAppActivityController(prisma as never, stats as never);

  beforeEach(() => jest.clearAllMocks());

  for (const metod of ['guruh', 'oquvchi'] as const) {
    it(`${metod}: rollar CEO, Branch Director, Administrator, Teacher`, () => {
      expect(reflector.get<string[]>(ROLES_KEY, controller[metod])).toEqual([
        'CEO', 'Branch Director', 'Administrator', 'Teacher',
      ]);
      expect(guard.canActivate(mockExecutionContext(controller[metod], ['Teacher']))).toBe(true);
      expect(() => guard.canActivate(mockExecutionContext(controller[metod], ['Cashier']))).toThrow(ForbiddenException);
    });
  }

  it('guruh: qorovul chaqiriladi, keyin servis; davr 30', async () => {
    const res = await controller.guruh('g1', { period: '30' }, 5, ['Teacher'], 1);
    expect(groupScope.assertCallerMayTouchGroup).toHaveBeenCalledWith(prisma, 5, ['Teacher'], 'g1', expect.any(String));
    expect(stats.guruhFaolligi).toHaveBeenCalledWith('g1', 1, 30, expect.any(Date));
    expect(res).toEqual({ ok: 1 });
  });

  it('qorovul rad etsa servis chaqirilmaydi', async () => {
    (groupScope.assertCallerMayTouchGroup as jest.Mock).mockRejectedValueOnce(new ForbiddenException());
    await expect(controller.guruh('g1', {}, 5, ['Teacher'], 1)).rejects.toBeInstanceOf(ForbiddenException);
    expect(stats.guruhFaolligi).not.toHaveBeenCalled();
  });

  it('oquvchi: qorovul, a`zolik, keyin servis; standart davr 7', async () => {
    await controller.oquvchi('g1', 10001, {}, 5, ['Administrator'], 1);
    expect(groupScope.assertCallerMayTouchGroup).toHaveBeenCalled();
    expect(stats.guruhAzosiEkaniniTekshir).toHaveBeenCalledWith('g1', 10001);
    expect(stats.oquvchiFaolligi).toHaveBeenCalledWith(10001, 1, 7, expect.any(Date));
  });
});
```

`student-app-activity.controller.spec.ts` — xuddi shu usulda: rollar `['CEO', 'Branch Director', 'Administrator']`; `Teacher` rad etiladi; `assertCallerMayTouchStudent` (`jest.mock('../common/auth/student-branch-scope')`) `(prisma, userId, id, companyId)` bilan chaqiriladi; rad etsa servis chaqirilmaydi.

- [ ] **Step 3: Run** `npx jest src/app-activity/*.controller.spec.ts` — Expected: FAIL.

- [ ] **Step 4: Implement**

`group-app-activity.controller.ts`:
```ts
import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AppActivityStatsService } from './app-activity-stats.service';
import { AppActivityQueryDto } from './dto/app-activity-query.dto';
import { davrniOqi } from './stats/davr';

const RAD_XABARI = "Bu guruh boshqa filialga tegishli — ilova faolligini ko'rish huquqingiz yo'q";

/**
 * Guruh sahifasi → «Ilova faolligi» tabi va o'quvchi yon oynasi (dizayn 6.1).
 * O'qituvchi faqat o'z guruhini ko'radi (`assertCallerMayTouchGroup`).
 */
@Controller('groups')
export class GroupAppActivityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: AppActivityStatsService,
  ) {}

  @Get(':id/app-activity')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async guruh(
    @Param('id') id: string,
    @Query() query: AppActivityQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await assertCallerMayTouchGroup(this.prisma, userId, roles, id, RAD_XABARI);
    return this.stats.guruhFaolligi(id, companyId, davrniOqi(query.period), new Date());
  }

  @Get(':id/app-activity/students/:studentId')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async oquvchi(
    @Param('id') id: string,
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: AppActivityQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await assertCallerMayTouchGroup(this.prisma, userId, roles, id, RAD_XABARI);
    await this.stats.guruhAzosiEkaniniTekshir(id, studentId);
    return this.stats.oquvchiFaolligi(studentId, companyId, davrniOqi(query.period), new Date());
  }
}
```

`student-app-activity.controller.ts`:
```ts
import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AppActivityStatsService } from './app-activity-stats.service';
import { AppActivityQueryDto } from './dto/app-activity-query.dto';
import { davrniOqi } from './stats/davr';

/** O'quvchi profili → «Ilova» tabi (dizayn 6.1). O'qituvchi profilga kirmaydi. */
@Controller('students')
export class StudentAppActivityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: AppActivityStatsService,
  ) {}

  @Get(':id/app-activity')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  async oquvchi(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: AppActivityQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    return this.stats.oquvchiFaolligi(id, companyId, davrniOqi(query.period), new Date());
  }
}
```

Module `controllers: [StudentActivityController, GroupAppActivityController, StudentAppActivityController]`.

`branch-route-policy.ts` — `ROUTE_POLICIES` ga yangi blok (boshqa `BRANCH_SCOPED_BY_ENTITY` bloklari yoniga):
```ts
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      "Ilova faolligi statistikasi (dizayn 6.1, ADR-0020). Guruh route'lari " +
      "`assertCallerMayTouchGroup` — sof o'qituvchi uchun biriktirilganlik, " +
      "qolganlar uchun filial; yon oyna qo'shimcha ravishda o'quvchi shu " +
      "guruhning faol a'zosi ekanini tekshiradi. Profil route'i " +
      "`assertCallerMayTouchStudent`.",
    routes: [
      'GET /groups/:id/app-activity',
      'GET /groups/:id/app-activity/students/:studentId',
      'GET /students/:id/app-activity',
    ],
  },
```

- [ ] **Step 5: Run** `npx jest src/app-activity src/common/auth/branch-route-policy.spec.ts` — Expected: PASS.

- [ ] **Step 6: HTTP tekshiruvi (dev baza)** — backendni worktree'dan `PORT=4300 CRONS_ENABLED=false TELEGRAM_BOT_TOKEN="" TELEGRAM_ADMIN_BOT_TOKEN="" npm run start:dev` bilan ishga tushiring; seed CEO bilan login qilib token oling (`POST /api/auth/login`, identifikatorlar `server/prisma/seed*.ts` dan); kichik guruh (≤ 10 o'quvchi) id sini `GET /api/groups` dan oling; `GET /api/groups/<id>/app-activity?period=30` va bitta o'quvchi uchun ikkala o'quvchi route'ini chaqiring. Kutiladi: 200, JSON shartnomaga mos, `GET /api/students/<id>/app-activity` bilan `groups/.../students/<id>` bir xil raqamlar; javob vaqti report ga yozilsin. Serverni to'xtating.

- [ ] **Step 7: Verify & commit** — `npm test && npm run typecheck && npx eslint src && npm run build`

```bash
git add server/src/app-activity server/src/common/auth/branch-route-policy.ts
git commit -m "Ilova faolligi route'lari: guruh, yon oyna va profil, qorovullar bilan

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Klient tiplari, so'rov hooklari, formatlash

**Files:**
- Create: `client/src/components/groups/app-activity/types.ts`
- Create: `client/src/components/groups/app-activity/activity-format.ts` (+ `activity-format.test.ts`)
- Create: `client/src/components/groups/app-activity/use-app-activity.ts`
- Create: `client/src/lib/daf-format-nomlari.ts`
- Modify: `client/src/components/media/media-fragen-panel.tsx` (lokal `FORMAT_NOMLARI` o'rniga import)

**Interfaces:**
- Consumes: Task 4 javob shartnomasi (nomlar aynan).
- Produces: `types.ts` dagi barcha tiplar; `formatDavomiylik(soniya: number): string`, `formatKunOy(sana: string): string`, `haftaKuni(sana: string): string`, `formatKunYorligi(sana: string): string`, `formatOxirgiFaollik(iso: string | null, now: Date): string`, `formatSanaVaqt(iso: string): string`, `foizRangi(foiz: number | null): string`, `foizUstunRangi(foiz: number): string`, `PLATFORMA_NOMLARI`, `KONIKMA_NOMLARI`, `DARAJA_HOLATI_NOMLARI`; `useGuruhFaolligi(groupId, davr)`, `useOquvchiFaolligi(url | null, davr)`, `davrniUrldanOqi(v: string | null): Davr`; `formatNomi(format: string | null): string`.

- [ ] **Step 1: `types.ts`** — server `app-activity-stats.types.ts` va `stats/*.ts` dagi tiplarni aynan ko'chiring (klient importlari bilan): `Davr`, `Platforma`, `Daraja`, `DarajaHolati`, `DarajaQatori`, `JoriyDaraja`, `DafSkill` (`'WORTSCHATZ' | 'GRAMMATIK' | 'HOEREN' | 'LESEN' | 'SCHREIBEN' | 'SPRECHEN'`), `KunSurati`, `KonikmaNatijasi`, `OxirgiFaollik`, `GuruhOquvchiQatori`, `GuruhKartalari`, `GuruhQiyinElement` (`QiyinElement` maydonlari + `de`, `uz`), `GuruhFaolligi`, `OquvchiBolimi`, `OquvchiFaolligi`. Fayl boshida izoh: `// Server: server/src/app-activity/app-activity-stats.types.ts — nomlar aynan shu.`

- [ ] **Step 2: Failing test** — `activity-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  foizRangi,
  formatDavomiylik,
  formatKunOy,
  formatKunYorligi,
  formatOxirgiFaollik,
  haftaKuni,
} from "./activity-format";

describe("formatDavomiylik", () => {
  it("soniyalarni daqiqa va soatga", () => {
    expect(formatDavomiylik(0)).toBe("0 daq");
    expect(formatDavomiylik(59)).toBe("<1 daq");
    expect(formatDavomiylik(60)).toBe("1 daq");
    expect(formatDavomiylik(3600)).toBe("1 soat");
    expect(formatDavomiylik(4830)).toBe("1 soat 20 daq");
  });
});

describe("sanalar", () => {
  it("kun.oy va hafta kuni satrdan (vaqt mintaqasiga bog'liq emas)", () => {
    expect(formatKunOy("2026-09-13")).toBe("13.09");
    expect(haftaKuni("2026-09-13")).toBe("Yak");
    expect(haftaKuni("2026-09-14")).toBe("Du");
    expect(formatKunYorligi("2026-09-14")).toBe("14.09 (Du)");
  });

  it("oxirgi faollik Toshkent vaqti bo'yicha", () => {
    const now = new Date("2026-09-13T10:00:00Z"); // 15:00 Toshkent
    expect(formatOxirgiFaollik(null, now)).toBe("Ilovaga hali kirmagan");
    expect(formatOxirgiFaollik("2026-09-13T09:58:00Z", now)).toBe("Hozirgina");
    expect(formatOxirgiFaollik("2026-09-13T04:05:00Z", now)).toBe("Bugun, 09:05");
    expect(formatOxirgiFaollik("2026-09-12T18:30:00Z", now)).toBe("Kecha, 23:30");
    expect(formatOxirgiFaollik("2026-09-12T19:30:00Z", now)).toBe("Bugun, 00:30");
    expect(formatOxirgiFaollik("2026-09-09T10:00:00Z", now)).toBe("4 kun oldin");
  });
});

describe("foizRangi", () => {
  it("80 va 60 chegaralari, amber ishlatilmaydi", () => {
    expect(foizRangi(null)).toContain("muted");
    expect(foizRangi(80)).toContain("green");
    expect(foizRangi(60)).toContain("yellow");
    expect(foizRangi(59)).toContain("red");
    expect(foizRangi(70)).not.toContain("amber");
  });
});
```

- [ ] **Step 3: Run** `cd client && npx vitest run src/components/groups/app-activity` — Expected: FAIL.

- [ ] **Step 4: Implement** — `activity-format.ts`:

```ts
import type { DafSkill, DarajaHolati, Platforma } from "./types";

export const PLATFORMA_NOMLARI: Record<Platforma, string> = {
  WEB: "Veb",
  ANDROID: "Android",
  IOS: "iOS",
};

export const KONIKMA_NOMLARI: Record<DafSkill, { uz: string; de: string }> = {
  WORTSCHATZ: { uz: "Lug'at", de: "Wortschatz" },
  GRAMMATIK: { uz: "Grammatika", de: "Grammatik" },
  LESEN: { uz: "O'qish", de: "Lesen" },
  HOEREN: { uz: "Tinglash", de: "Hören" },
  SCHREIBEN: { uz: "Yozish", de: "Schreiben" },
  SPRECHEN: { uz: "Gapirish", de: "Sprechen" },
};

export const DARAJA_HOLATI_NOMLARI: Record<DarajaHolati, string> = {
  DAVOM: "Davom etmoqda",
  TUGATILGAN: "Tugatilgan",
  BOSHLANMAGAN: "Boshlanmagan",
  KURS_YOQ: "Kurs hali yo'q",
};

export function formatDavomiylik(soniya: number): string {
  if (soniya <= 0) return "0 daq";
  if (soniya < 60) return "<1 daq";
  const daqiqa = Math.floor(soniya / 60);
  const soat = Math.floor(daqiqa / 60);
  const qoldiq = daqiqa % 60;
  if (soat === 0) return `${qoldiq} daq`;
  return qoldiq === 0 ? `${soat} soat` : `${soat} soat ${qoldiq} daq`;
}

/** `YYYY-MM-DD` → `DD.MM`. Satrdan o'qiladi — brauzer vaqt mintaqasi aralashmaydi. */
export function formatKunOy(sana: string): string {
  return `${sana.slice(8, 10)}.${sana.slice(5, 7)}`;
}

const HAFTA = ["Yak", "Du", "Se", "Chor", "Pay", "Ju", "Sha"];

export function haftaKuni(sana: string): string {
  return HAFTA[new Date(`${sana}T00:00:00Z`).getUTCDay()];
}

export function formatKunYorligi(sana: string): string {
  return `${formatKunOy(sana)} (${haftaKuni(sana)})`;
}

const TOSHKENT_MS = 5 * 60 * 60 * 1000;
const toshkent = (d: Date) => new Date(d.getTime() + TOSHKENT_MS);
const kunKaliti = (d: Date) => toshkent(d).toISOString().slice(0, 10);
const soatDaqiqa = (d: Date) => toshkent(d).toISOString().slice(11, 16);

export function formatOxirgiFaollik(iso: string | null, now: Date): string {
  if (!iso) return "Ilovaga hali kirmagan";
  const vaqt = new Date(iso);
  if (now.getTime() - vaqt.getTime() < 5 * 60 * 1000) return "Hozirgina";
  const farq = Math.round(
    (new Date(`${kunKaliti(now)}T00:00:00Z`).getTime() -
      new Date(`${kunKaliti(vaqt)}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (farq <= 0) return `Bugun, ${soatDaqiqa(vaqt)}`;
  if (farq === 1) return `Kecha, ${soatDaqiqa(vaqt)}`;
  return `${farq} kun oldin`;
}

export function formatSanaVaqt(iso: string): string {
  const d = new Date(iso);
  return `${formatKunOy(kunKaliti(d))} · ${soatDaqiqa(d)}`;
}

/**
 * Davomat statistikasidagi chegaralar: 80 va 60. `amber-*` ISHLATILMAYDI —
 * `globals.css` `@theme` uni faqat `.lumio` ichidagi o'zgaruvchilarga bog'lagan.
 */
export function foizRangi(foiz: number | null): string {
  if (foiz === null) return "text-muted-foreground";
  if (foiz >= 80) return "text-green-600 dark:text-green-400";
  if (foiz >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function foizUstunRangi(foiz: number): string {
  if (foiz >= 80) return "bg-green-500";
  if (foiz >= 60) return "bg-yellow-400";
  return "bg-red-500";
}
```

`use-app-activity.ts`:
```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Davr, GuruhFaolligi, OquvchiFaolligi } from "./types";

export function davrniUrldanOqi(qiymat: string | null): Davr {
  return qiymat === "30" ? 30 : 7;
}

export function useGuruhFaolligi(groupId: string, davr: Davr) {
  return useQuery<GuruhFaolligi>({
    queryKey: ["group-app-activity", groupId, davr],
    queryFn: () =>
      api
        .get<GuruhFaolligi>(`/groups/${groupId}/app-activity`, { params: { period: davr } })
        .then((r) => r.data),
    staleTime: 60_000,
  });
}

/** `url` — `/groups/:id/app-activity/students/:sid` yoki `/students/:id/app-activity`. */
export function useOquvchiFaolligi(url: string | null, davr: Davr) {
  return useQuery<OquvchiFaolligi>({
    queryKey: ["student-app-activity", url, davr],
    queryFn: () => api.get<OquvchiFaolligi>(url!, { params: { period: davr } }).then((r) => r.data),
    enabled: url !== null,
    staleTime: 60_000,
  });
}
```

(`api` — `client/src/lib/api.ts` ning default eksporti, `student-profile-tabs.tsx` dagi kabi.)

`lib/daf-format-nomlari.ts` — `media-fragen-panel.tsx:27-41` dagi `FORMAT_NOMLARI` obyektini tipi va importi bilan aynan ko'chiring, `export` qiling va qo'shing:
```ts
export function formatNomi(format: string | null): string {
  if (!format) return "—";
  return (FORMAT_NOMLARI as Record<string, string>)[format] ?? format;
}
```
`media-fragen-panel.tsx` da lokal obyektni o'chirib `import { FORMAT_NOMLARI } from "@/lib/daf-format-nomlari";` qiling.

- [ ] **Step 5: Run** `npx vitest run` — Expected: PASS.
- [ ] **Step 6: Verify & commit** — `npm test && npm run typecheck && npx eslint src && npm run build`

```bash
git add client/src/components/groups/app-activity client/src/lib/daf-format-nomlari.ts client/src/components/media/media-fragen-panel.tsx
git commit -m "Ilova faolligi klienti: tiplar, so'rovlar va formatlash

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Guruh sahifasi → «Ilova faolligi» tabi

**Files:**
- Create: `client/src/components/groups/app-activity/activity-ui.tsx`
- Create: `client/src/components/groups/app-activity/group-app-activity-tab.tsx`
- Create: `client/src/components/groups/app-activity/group-activity-table.tsx`
- Create: `client/src/components/groups/app-activity/difficult-items.tsx`
- Create: `client/src/components/groups/app-activity/activity-explainer.tsx`
- Modify: `client/src/components/groups/group-detail-tabs.tsx`

**Interfaces:**
- Consumes: Task 6 hammasi.
- Produces: `GroupAppActivityTab({ groupId }: { groupId: string })`; `activity-ui.tsx` dan `PeriodToggle({ value, onChange })`, `DayBars({ kunlar, className })`, `ProgressLine({ value, total, className })`, `KpiCard({ icon, label, value, hint, tooltip, valueClassName })`, `ActivityError({ onRetry })`, `usePeriodParam(): [Davr, (d: Davr) => void]`. Task 8 `StudentActivitySheet({ groupId, studentId, davr, onDavrChange, onClose })` ni ishlatadi — bu taskda sheet hali yo'q, qatorni bosish `selectedId` ni o'rnatadi va sheet Task 8 da ulanadi (bu taskda `selectedId` holati va `onClick` bor, sheet render qilinmaydi).

Ko'rinish manbasi — demo: `.worktrees/ilova-faolligi-demo/client/src/components/groups/app-activity/{activity-ui.tsx,group-app-activity-tab.tsx}`. O'sha tuzilma, klasslar va tooltip matnlarini saqlang; quyidagi farqlar SHART (dizayn 7-bo'lim jadvali):

- [ ] **Step 1: `activity-ui.tsx`** — demo faylidan: `PeriodToggle` (tipi `Davr`), `ProgressLine`, `KpiCard` (demo tab faylidan ko'chadi). `DemoBanner`, `formatMinutes`, `formatLastSeen`, `pctClass` KO'CHMAYDI (Task 6 formatlash ishlatiladi). Qo'shing:

```tsx
export function DayBars({ kunlar, className }: { kunlar: KunSurati[]; className?: string }) {
  const max = Math.max(1800, ...kunlar.map((k) => k.faolSoniya));
  const tor = kunlar.length > 7;
  return (
    <div className={cn("flex h-7 items-stretch", className)}>
      {kunlar.map((kun) => {
        const bor = kun.faolSoniya > 0 || kun.shugullangan;
        return (
          <Tooltip key={kun.sana}>
            <TooltipTrigger asChild>
              <span className={cn("flex items-end", tor ? "px-px" : "px-0.5")}>
                <span
                  className={cn(
                    "rounded-sm",
                    tor ? "w-1" : "w-1.5",
                    !kun.kuzatilgan && "bg-muted/40",
                    kun.kuzatilgan && (kun.shugullangan ? "bg-primary" : kun.kirdi || kun.faolSoniya > 0 ? "bg-primary/35" : "bg-muted"),
                  )}
                  style={{ height: bor ? `${Math.max(18, (kun.faolSoniya / max) * 100)}%` : "12%" }}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col">
                <span className="font-medium">{formatKunYorligi(kun.sana)}</span>
                {!kun.kuzatilgan ? (
                  <span>Kuzatuv boshlanmagan</span>
                ) : (
                  <>
                    <span>{kun.shugullangan ? "Shug'ullangan kun" : kun.kirdi ? "Faqat kirgan" : "Kirmagan"}</span>
                    {kun.savollar > 0 && <span>Savollar: {kun.savollar}</span>}
                    {kun.faolSoniya > 0 && <span>Faol: {formatDavomiylik(kun.faolSoniya)}</span>}
                    {kun.radioSoniya > 0 && <span>Radio: {formatDavomiylik(kun.radioSoniya)}</span>}
                  </>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function ActivityError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}

/** `?period=` — 7 standart, URL'dan olib tashlanadi (dizayn 7). */
export function usePeriodParam(): [Davr, (d: Davr) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const davr = davrniUrldanOqi(searchParams.get("period"));
  const setDavr = useCallback(
    (d: Davr) => {
      const params = new URLSearchParams(searchParams.toString());
      if (d === 7) params.delete("period");
      else params.set("period", String(d));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );
  return [davr, setDavr];
}
```

- [ ] **Step 2: `group-activity-table.tsx`** — demo jadvali asosida, props `{ oquvchilar: GuruhOquvchiQatori[]; davr: Davr; guruhDarajasi: Daraja | null; onSelect: (id: number) => void }`. Fayl boshida izoh: `// Sahifalanmaydi — dizayn 7: o'qituvchi butun guruhni bir qarashda solishtiradi (CLAUDE.md sahifalash qoidasiga ongli istisno).` Ustunlar:
  - `#` (`w-12 border-r`).
  - **O'quvchi**: avatar (`photo`, ism bosh harflari), ism; ostida akkaunt yo'q bo'lsa qizil «Akkaunt yo'q», aks holda `formatOxirgiFaollik(oxirgiFaollik?.vaqt ?? null, now)` + ` · ${PLATFORMA_NOMLARI[platforma]}`; kirmagan bo'lsa qizil.
  - **Faol vaqt** (o'ngga): `formatDavomiylik(faolSoniya)` yoki `—`.
  - **Shug'ullangan kunlar**: sarlavhada `Tooltip` «Shu kuni kamida bitta mashq qildi yoki kamida 5 daqiqa radio tingladi»; katakda `{shugullanganKunlar}/{maxraj}` (maxraj < davr bo'lsa `Tooltip`: `${formatKunOy(hisobBoshi)} dan beri`) + `<DayBars kunlar={kunlar} className="hidden sm:flex" />`.
  - **To'g'ri javob** (o'ngga): `foiz === null` → `—`; aks holda `foiz%` (`foizRangi`) va ostida `${savollar} savol`.
  - **Kurs** (`hidden md:table-cell`): `Badge` `kurs.daraja`; `KURS_YOQ` → «Kurs hali yo'q»; aks holda `${tugatilgan}/${jami} dars` + `ProgressLine`; `guruhdanOrqada` → qizil kichik `Badge` «Guruhdan orqada» (tooltip: «O'quvchi darajasi guruh darajasidan past»).
  - **Radio** (`hidden lg:table-cell`, o'ngga).
  - Seriya ustuni YO'Q. Akkauntsiz o'quvchi qatori: raqam ustunlarida `—`.
  - Qator `onClick={() => onSelect(studentId)}`, `cursor-pointer hover:bg-muted/50`. `now` — `useState(() => new Date())`.

- [ ] **Step 3: `difficult-items.tsx`** — demo «Guruh qiynalayotgan elementlar» bo'limi asosida, props `{ items: GuruhQiyinElement[] }`. Sarlavha **«Guruh qiynalayotgan so'z va gaplar»**, izoh «Birinchi urinishdagi xato foizi bo'yicha · kamida 3 o'quvchi ishlagan». Ustunlar: `#` (`w-12 border-r`), «So'z yoki gap» (`de`, ostida `uz`), «Ko'nikma va format» (`Badge` `KONIKMA_NOMLARI[konikma].uz`, ostida `formatNomi(format)`), «Xato» (ustun + foiz; ≥ 50 qizil, aks holda sariq), «O'quvchilar» (`oquvchilar`). Bo'sh bo'lsa: «Hali yetarli ma'lumot yo'q — kamida 3 o'quvchi bir xil so'z yoki gapni ishlashi kerak».

- [ ] **Step 4: `group-app-activity-tab.tsx`**

```tsx
"use client";

import { useState } from "react";
import { BookOpenCheck, Clock, Radio, Target, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityError, KpiCard, PeriodToggle, usePeriodParam } from "./activity-ui";
import { formatDavomiylik, foizRangi } from "./activity-format";
import { DifficultItems } from "./difficult-items";
import { GroupActivityTable } from "./group-activity-table";
import { ActivityExplainer } from "./activity-explainer";
import { useGuruhFaolligi } from "./use-app-activity";

export function GroupAppActivityTab({ groupId }: { groupId: string }) {
  const [davr, setDavr] = usePeriodParam();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, isLoading, isError, refetch } = useGuruhFaolligi(groupId, davr);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">O&apos;quvchilarning ilovadagi faolligi</h3>
          <p className="text-sm text-muted-foreground">Veb, Android va iOS bir xil qoida bilan sanaladi</p>
        </div>
        <PeriodToggle value={davr} onChange={setDavr} />
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : isError || !data ? (
        <ActivityError onRetry={() => void refetch()} />
      ) : data.oquvchilar.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">Guruhda faol o&apos;quvchi yo&apos;q</p>
        </div>
      ) : (
        <>
          {/* 5 karta — Step 4a */}
          <GroupActivityTable
            oquvchilar={data.oquvchilar}
            davr={davr}
            guruhDarajasi={data.guruhDarajasi}
            onSelect={setSelectedId}
          />
          <DifficultItems items={data.qiyinElementlar} />
          <ActivityExplainer kuzatuvBoshi={data.kuzatuvBoshi} />
        </>
      )}
    </div>
  );
}
```

Step 4a — kartalar (demo `grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5`), `k = data.kartalar`:
  1. `Users` «Ilovaga kirdi» — `${k.kirganlar} / ${k.oquvchilar}`; hint: `k.oquvchilar - k.akkauntlar > 0` bo'lsa `${n} nafarida akkaunt yo'q`, aks holda kirmaganlar soni yoki «Hammasi kirgan»; tooltip «Tanlangan davrda kamida 10 soniya faol bo'lgan o'quvchilar».
  2. `Clock` «O'rtacha faol vaqt» — `k.ortachaFaolSoniya === null ? "—" : formatDavomiylik(...)`; hint «kirganlar orasida, bir o'quvchiga»; tooltip demo matni.
  3. `Target` «To'g'ri javob» — `k.foiz%` (`foizRangi`), hint `birinchi urinishda · ${k.savollar} savol`; tooltip «Har bir savol birinchi so'ralganda to'g'ri topilgani. Xatodan keyin qayta so'ralgandagi javob bu foizga kirmaydi».
  4. `BookOpenCheck` «Tugatilgan darslar» — `k.tugatilganDarslar`; hint «davrda, har dars bir marta»; tooltip «Davrda oxirigacha ishlangan turli darslar. Bitta darsni qayta ishlash qo'shimcha sanalmaydi».
  5. `Radio` «Radio» — `formatDavomiylik(k.radioSoniya)`; hint `${k.radioTinglaganlar} o'quvchi tingladi`; tooltip demo matni.

`TabSkeleton` — 5 ta `Skeleton h-24 rounded-xl` karta va 5 ta `Skeleton h-12` qator. `ActivityExplainer` — alohida kichik fayl `activity-explainer.tsx` (demo `<details>` bloki), bandlar: Faol vaqt (demo matni); Radio (demo matni); **Shug'ullangan kun** — «kamida bitta mashq javobi yoki kamida 5 daqiqa radio. Faqat ilovani ochish sanalmaydi»; **Kunlar maxraji** — «o'quvchi akkaunti yaratilgan yoki kuzatuv boshlangan kundan sanaladi»` + (kuzatuvBoshi bo'lsa ` Kuzatuv ${formatKunOy(kuzatuvBoshi)} dan boshlangan.`); To'g'ri javob — «har bir savol birinchi so'ralganda… o'quvchi natija ekranida ko'radigan raqam bilan bir xil ta'rif»; Kurs — «darajadagi kurs darslaridan tugatilganlari; o'quvchi darajasi guruhnikidan past bo'lsa «Guruhdan orqada» belgisi».

- [ ] **Step 5: `group-detail-tabs.tsx`** — `O'quvchilar` triggeridan keyin (rol cheklovisiz — o'qituvchi ham ko'radi):
```tsx
<TabsTrigger value="ilova">Ilova faolligi</TabsTrigger>
```
va tegishli joyga (mavjud lazy naqsh bilan: `ilovaVisible` state + `ilovaShown` ref, mount effekti va `handleTabChange` da `tab === "ilova"` bo'lsa yoqiladi):
```tsx
<TabsContent value="ilova">
  {ilovaVisible && <GroupAppActivityTab groupId={group.id} />}
</TabsContent>
```
Demodagi `fetchStudents` o'zgarishlari va `[ilova-demo]` diagnostikasi KO'CHMAYDI.

- [ ] **Step 6: Verify & commit** — `npm test && npm run typecheck && npx eslint src && npm run build`. Yangi fayllar 500 qatordan kichik (maqsad 100–300).

```bash
git add client/src/components/groups
git commit -m "Guruh sahifasida «Ilova faolligi» tabi: kartalar, jadval, qiynalayotgan so'zlar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: O'quvchi yon oynasi va profil tabi

**Files:**
- Create: `client/src/components/groups/app-activity/student-activity-panel.tsx`
- Create: `client/src/components/groups/app-activity/student-activity-sections.tsx`
- Create: `client/src/components/groups/app-activity/student-activity-sheet.tsx`
- Create: `client/src/components/students/student-app-activity-tab.tsx`
- Modify: `client/src/components/groups/app-activity/group-app-activity-tab.tsx` (sheet ulanadi)
- Modify: `client/src/components/students/student-profile-tabs.tsx`

**Interfaces:**
- Consumes: Task 6–7.
- Produces: `StudentActivityPanel({ url, davr, onDavrChange, renderHeader, bodyClassName })` — bitta komponent, sheet ham profil ham shu (dizayn 7: «Komponent bitta»). `StudentActivitySheet({ groupId, studentId, davr, onDavrChange, onClose })`. `StudentAppActivityTab({ studentId }: { studentId: number })`.

Ko'rinish manbasi — demo `student-activity-sheet.tsx`. Bo'limlar tartibi va klasslar saqlanadi; farqlar:

- [ ] **Step 1: `student-activity-sections.tsx`** — demo `Section`, `ShareBar` (soniya bilan: `formatDavomiylik`), `heatClass(soniya)` (chegaralar 600/1500/2700 s), `PLATFORM_ICONS` va quyidagi bo'lim komponentlari, har biri `data: OquvchiFaolligi` oladi:
  - `VaqtBolimi` — «Ilovada vaqt»: Faol vaqt kartasi (`formatDavomiylik(vaqt.faolSoniya)`, ostida `${shugullanganKunlar} / ${maxraj} kun shug'ullangan`), Radio kartasi («faol vaqtga qo'shilmaydi»), «Platforma bo'yicha» 3 ta `ShareBar`, «Bo'lim bo'yicha» Ta'lim (`bolim.LERNEN`) / Boshqa (`bolim.OTHER`).
  - `XaritaBolimi` — «Kunlik faollik», hint «Oxirgi 30 kun · rang — faol vaqt, nuqta — shug'ullangan kun»; `grid grid-cols-10 gap-1.5`, har kun `aspect-square rounded-md` `heatClass` + shug'ullangan kunda markazda `size-1.5 rounded-full bg-primary-foreground` nuqta; kuzatilmagan kun `bg-muted/40`; tooltip `DayBars` bilan bir xil matn; ostida `formatKunOy(xarita[0].sana)` va «Bugun».
  - `MashqBolimi` — «Mashqlar»: To'g'ri javob / **Savollar** / Xato kartalari; «Ko'nikma bo'yicha» `konikmalar` (6 ta; `savollar === 0` → «Hali mashq yo'q»).
  - `KursBolimi` — «Kurs progressi»: har `darajalar` qatori — daraja `Badge`, holat (`DARAJA_HOLATI_NOMLARI`), `KURS_YOQ` bo'lmasa `${tugatilgan}/${jami} dars` + `ProgressLine`, `tugatilganSana` bo'lsa `formatKunOy(sana.slice(0,10))` dagi sana; joriy daraja qatori `bg-primary/10`; ostida joriy daraja `bolimlar` (demo birlik ro'yxati: `nomi`, `tugatilgan/jami` yoki `CheckCircle2`).
  - `SozlarBolimi` — «So'zlar», hint `Bugun takrorlash kerak: ${sozlar.bugunTakror} ta so'z`; demo uch rangli chiziq (jami 0 bo'lsa chiziq o'rniga «Hali so'z o'rganilmagan»); «Eng ko'p xato qilingan so'zlar» `qiyinSozlar` (`xatolar` marta xato).
  - `SeanslarBolimi` — «Seanslar tarixi», hint `Tanlangan davrda oxirgi ${seanslar.length} ta seans`; qator: `Badge` Dars/Takrorlash, `darsNomi ?? "Takrorlash"`, ostida `formatSanaVaqt(boshlandi)` · davomiylik (`formatDavomiylik((tugadi − boshlandi)/1000)`); o'ngda `${togri}/${savollar}` (`foizRangi(foizi)`). Platforma belgisi YO'Q (seansda platforma yo'q). Bo'sh: «Bu davrda mashq qilinmagan».

- [ ] **Step 2: `student-activity-panel.tsx`**

```tsx
"use client";

import { Flame, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import { ActivityError, PeriodToggle } from "./activity-ui";
import { formatOxirgiFaollik, PLATFORMA_NOMLARI } from "./activity-format";
import {
  KursBolimi, MashqBolimi, SeanslarBolimi, SozlarBolimi, VaqtBolimi, XaritaBolimi,
} from "./student-activity-sections";
import type { Davr, OquvchiFaolligi } from "./types";
import { useOquvchiFaolligi } from "./use-app-activity";

export function oxirgiFaollikMatni(data: OquvchiFaolligi): string {
  const matn = formatOxirgiFaollik(data.oxirgiFaollik?.vaqt ?? null, new Date());
  return data.oxirgiFaollik ? `${matn} · ${PLATFORMA_NOMLARI[data.oxirgiFaollik.platforma]}` : matn;
}

export function StudentActivityPanel({
  url,
  davr,
  onDavrChange,
  renderHeader,
  bodyClassName,
}: {
  url: string;
  davr: Davr;
  onDavrChange: (d: Davr) => void;
  /** Sheet o'z sarlavhasini chizadi (`data` yuklanmagan paytda ham); profil sahifasida `null`. */
  renderHeader: ((data: OquvchiFaolligi | undefined, meta: React.ReactNode) => React.ReactNode) | null;
  bodyClassName?: string;
}) {
  const { data, isLoading, isError, refetch } = useOquvchiFaolligi(url, davr);

  const meta = data && (
    <div className="flex flex-wrap gap-2 pt-2">
      <Badge variant="secondary" className="gap-1"><Sparkles /> {data.joriyDaraja.daraja} · {data.fortschritt.stufe.uz}</Badge>
      <Badge variant="secondary" className="gap-1"><Trophy /> {formatNumber(data.fortschritt.gesamt)} ball</Badge>
      <Badge variant="secondary" className="gap-1"><Flame /> {data.fortschritt.serie} kun seriya</Badge>
    </div>
  );

  return (
    <>
      {renderHeader?.(data, meta)}
      <div className={cn("space-y-7", bodyClassName)}>
        {isLoading ? (
          <PanelSkeleton />
        ) : isError || !data ? (
          <ActivityError onRetry={() => void refetch()} />
        ) : (
          <PanelTanasi data={data} davr={davr} onDavrChange={onDavrChange} sarlavhaYoq={renderHeader === null} meta={meta} />
        )}
      </div>
    </>
  );
}

function PanelTanasi({
  data, davr, onDavrChange, sarlavhaYoq, meta,
}: {
  data: OquvchiFaolligi;
  davr: Davr;
  onDavrChange: (d: Davr) => void;
  sarlavhaYoq: boolean;
  meta: React.ReactNode;
}) {
  return (
    <>
        {sarlavhaYoq && (
          <div>
            <p className="text-sm text-muted-foreground">Oxirgi faollik: {oxirgiFaollikMatni(data)}</p>
            {meta}
          </div>
        )}
        {!data.akkaunt ? (
          <BoshHolat sarlavha="Akkaunt yo'q" matn="O'quvchiga ilova akkaunti ochilmagan — faollikni o'lchab bo'lmaydi." />
        ) : !data.oxirgiFaollik && data.mashq.savollar === 0 ? (
          <BoshHolat
            sarlavha="O'quvchi ilovaga hali kirmagan"
            matn="Na vebdan, na telefondan kirish qayd etilmagan. Ota-onasi yoki o'quvchining o'zi bilan gaplashib ko'rish mumkin."
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Davr</span>
              <PeriodToggle value={davr} onChange={onDavrChange} />
            </div>
            <VaqtBolimi data={data} />
            <XaritaBolimi data={data} />
            <MashqBolimi data={data} />
            <KursBolimi data={data} />
            <SozlarBolimi data={data} />
            <SeanslarBolimi data={data} />
          </>
        )}
    </>
  );
}
```

Importlarga `import { cn } from "@/lib/utils";` qo'shing. `BoshHolat({ sarlavha, matn })` — demo «ilovaga hali kirmagan» bloki (`rounded-xl border px-4 py-8 text-center`, `<p className="font-medium">` + `<p className="mt-1 text-sm text-muted-foreground">`). `PanelSkeleton` — 2 ta `Skeleton h-5` qator va 4 ta `Skeleton h-28 rounded-xl` bo'lim.

- [ ] **Step 3: `student-activity-sheet.tsx`** — demo `Sheet` skeleti (`SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"`, `SheetHeader border-b px-6 py-4`, tanasi `flex-1 overflow-y-auto px-6 py-5`):

```tsx
export function StudentActivitySheet({
  groupId, studentId, davr, onDavrChange, onClose,
}: {
  groupId: string;
  studentId: number | null;
  davr: Davr;
  onDavrChange: (d: Davr) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {studentId !== null && (
          <StudentActivityPanel
            url={`/groups/${groupId}/app-activity/students/${studentId}`}
            davr={davr}
            onDavrChange={onDavrChange}
            bodyClassName="flex-1 overflow-y-auto px-6 py-5"
            renderHeader={(data, meta) => (
              <SheetHeader className="border-b px-6 py-4">
                {data ? (
                  <>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-11">
                        <AvatarImage src={data.photo ?? undefined} alt="" />
                        <AvatarFallback>{boshHarflar(data.ism)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <SheetTitle className="truncate">{data.ism}</SheetTitle>
                        <SheetDescription>Oxirgi faollik: {oxirgiFaollikMatni(data)}</SheetDescription>
                      </div>
                    </div>
                    {data.akkaunt && meta}
                  </>
                ) : (
                  <>
                    <SheetTitle className="sr-only">O&apos;quvchi faolligi</SheetTitle>
                    <Skeleton className="h-11 w-56" />
                  </>
                )}
              </SheetHeader>
            )}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function boshHarflar(ism: string): string {
  return ism.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
}
```

`SheetTitle` har holatda bor (Radix a11y ogohlantirishi bo'lmasin).

`group-app-activity-tab.tsx` da jadvaldan keyin:
```tsx
<StudentActivitySheet
  groupId={groupId}
  studentId={selectedId}
  davr={davr}
  onDavrChange={setDavr}
  onClose={() => setSelectedId(null)}
/>
```

- [ ] **Step 4: `student-app-activity-tab.tsx`**

```tsx
"use client";

import { usePeriodParam } from "@/components/groups/app-activity/activity-ui";
import { StudentActivityPanel } from "@/components/groups/app-activity/student-activity-panel";

/** O'quvchi profili → «Ilova» tabi: yon oynadagi panelning o'zi (dizayn 7). */
export function StudentAppActivityTab({ studentId }: { studentId: number }) {
  const [davr, setDavr] = usePeriodParam();
  return (
    <div className="max-w-3xl">
      <StudentActivityPanel
        url={`/students/${studentId}/app-activity`}
        davr={davr}
        onDavrChange={setDavr}
        renderHeader={null}
        bodyClassName=""
      />
    </div>
  );
}
```

`student-profile-tabs.tsx` — `canManage` bilan (CEO/BD/Admin; server ham shu rollar), `Mock imtihonlar` triggeridan keyin:
```tsx
{canManage && <TabsTrigger value="ilova">Ilova</TabsTrigger>}
```
va mavjud lazy naqsh (`ilovaVisible` + `ilovaShown` ref, mount effekti va `handleTabChange`):
```tsx
{canManage && (
  <TabsContent value="ilova">
    {ilovaVisible && <StudentAppActivityTab studentId={student.id} />}
  </TabsContent>
)}
```

Diqqat: `canManage` ichida Cashier (5) yo'q ekanini tekshiring (`[1,2,3]`). Profil sahifasini Cashier ko'ra oladi, lekin bu tab unga ko'rinmasin — server ham rad etadi.

- [ ] **Step 5: Verify & commit** — `npm test && npm run typecheck && npx eslint src && npm run build`

```bash
git add client/src/components/groups/app-activity client/src/components/students
git commit -m "O'quvchi faolligi: guruhdagi yon oyna va profilning «Ilova» tabi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Hujjatlar

**Files:**
- Modify: `client/CLAUDE.md` (`#### Activity tracking` bo'limidan keyin yangi bo'lim; `### Student Profile Tabs` jadvaliga `ilova` qatori)
- Modify: `docs/superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md` (`**Holati:**`)

- [ ] **Step 1: `client/CLAUDE.md`** — «Student Profile Tabs» jadvaliga: `| Ilova | \`ilova\` | App usage: active time, radio, practice days, exercise accuracy, course progress (CEO/BD/Admin). Same panel as the group sheet |` va sarlavhadagi «8 tabs» ni «9 tabs» ga. `### Lesson Changes Tab (Group Detail)` dan oldin:

```markdown
### App Activity Tab (Group Detail) and Student Activity Panel

- **Tab "Ilova faolligi"** (URL value `ilova`, period `?period=30`, default 7 omitted) on `/groups/[id]` → `groups/app-activity/group-app-activity-tab.tsx`. Visible to every role that opens the group page, teachers included — the server scopes a pure teacher to their own groups (`GET /groups/:id/app-activity`, `assertCallerMayTouchGroup`).
- Every number comes from the server (`AppActivityStatsService`, design doc sections 3 and 6). **Do not recompute any metric client-side** — the group row, the student sheet and the profile tab must never disagree about one student.
- The roster table is **deliberately not paginated** (design section 7): a teacher compares the whole group at a glance and groups are small. This is a conscious exception to the pagination rule.
- Row click opens `student-activity-sheet.tsx`; the profile tab `students/student-app-activity-tab.tsx` (`?tab=ilova`, CEO/BD/Admin) renders the same `StudentActivityPanel`. There is one panel component — do not fork it.
- Daily bars: height = active time, dark = practice day (≥1 exercise answer or ≥5 min radio), light = opened only, faded = before tracking started. Colors use `yellow-*`, never `amber-*` (colourless in the admin panel).
```

- [ ] **Step 2: Spec holati** — `**Holati:**` qatorini: `dizayn CEO tomonidan tasdiqlangan (13.09.2026); 1-bosqich (mashq yozuvi) PRODDA (PR #485); 2-bosqich (vaqt hisobi, veb) PRODDA (PR #493); 3-bosqich (statistika va ekranlar) kodda, deploy qilinmagan; 4-bosqich (native) amalga oshirilmagan`.

- [ ] **Step 3: Verify & commit** — server va klient to'liq tekshiruvlari (yuqoridagi Global Constraints).

```bash
git add client/CLAUDE.md docs/superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md
git commit -m "Ilova faolligi ekranlari: portal qo'llanmasi va dizayn holati

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Haqiqiy brauzerda tekshirish (kod yozilmaydi)

Controller alohida tekshiruv subagenti bilan bajaradi.

- Backend worktree'dan `PORT=4300 CRONS_ENABLED=false TELEGRAM_BOT_TOKEN="" TELEGRAM_ADMIN_BOT_TOKEN=""`; klient `NEXT_PUBLIC_API_URL=http://localhost:4300/api` bilan `:3000` da (production build afzal: `next build && next start -p 3000`).
- Dev bazada kichik guruh tanlanadi (≤ 10 o'quvchi, masalan Toshkent `#001`). Ma'lumot yetmasa: seed o'quvchi `906549532` / `123456` bilan `student.localhost:3000` da bir dars seansini ishlab va radio tinglab ma'lumot hosil qilinadi (dev baza, ruxsat etilgan).
- CEO sifatida `localhost:3000/groups/<id>?tab=ilova`: kartalar, jadval, kunlik ustunchalar tooltip'i, 7↔30 almashuvi (URL `?period=30`, 7 da parametr yo'qoladi), qatorni bosish → yon oyna, profil `?tab=ilova` da xuddi shu raqamlar.
- Shu o'quvchi uchun API raqamlari bazadagi `StudentAppSession`/`DafAttempt` bilan qo'lda solishtiriladi (faol vaqt, shug'ullangan kunlar, to'g'ri %).
- O'qituvchi (guruhga biriktirilgan) `lehrer.localhost:3000` da tabni ko'radi; boshqa guruh o'qituvchisi uchun API 403.
- Mobil kenglik (390 px) va qorong'i rejim skrinshotlari; yuklanish skeleti; backend to'xtatilganda «Ma'lumotni yuklab bo'lmadi» + qayta urinish.
- Guruh endpointi javob vaqti qayd etiladi.

---

## Deploy eslatmasi (reja tashqarisida, CEO ruxsati bilan)

Migratsiya YO'Q. Tartib: `railway up server --path-as-root --detach` (SUCCESS, `GET /api/groups/x/app-activity` → 401) → `cd client && vercel --prod --yes` → PR merge. Klient serverdan oldin chiqsa tab 404 bilan «Ma'lumotni yuklab bo'lmadi» ko'rsatadi — zararsiz, lekin tartibni buzmang. Deploydan keyin demo worktree (`.worktrees/ilova-faolligi-demo`, shox `demo/ilova-faolligi`) o'chiriladi (dizayn 9-bo'lim).
