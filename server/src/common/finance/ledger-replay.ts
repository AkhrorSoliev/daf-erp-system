/**
 * "Bu pul qayerga ketdi?" — ledger'ga LANGARLANGAN replay.
 *
 * Nima uchun bu fayl bor
 * ----------------------
 * Oldingi `computePaymentDestination` har to'lovni FIFO navbatga qo'yib,
 * KEYINGI dars yechimlarini o'shandan to'ldirardi. Navbat bo'sh bo'lganda
 * (o'quvchi qarzga dars o'tganda) yechim jimgina tushib qolar, keyingi to'lov
 * uni RETROAKTIV qoplamas edi — ya'ni allaqachon sarflangan pul "balansda
 * qoldi" deb ko'rsatilardi. PROD o'lchovi: 569 ta o'quvchidan 540 tasida
 * karta noto'g'ri raqam ko'rsatgan.
 *
 * Muhimi shundaki, javob ALLAQACHON bazada. Har bir `Transaction` qatori
 * `balanceBefore` / `balanceAfter` ni lock ostida yozadi
 * (`TransactionsWriteService.lockStudent`), va PROD auditi 39 516 qatorda
 * bitta ham buzilish topmadi. Shuning uchun bu modul haqiqatni QAYTA
 * QURMAYDI — uni O'QIYDI va o'ziga langarlanadi.
 *
 * Asosiy qarorlar (loyihaviy, o'zgartirilmasin)
 * --------------------------------------------
 * 1. HECH QANDAY reversal filtri yo'q. Chaqiruvchi o'quvchining BARCHA
 *    pul-harakat qatorlarini beradi. Bekor qilingan qator va uning qarshi
 *    qatori ikkalasi ham kiradi va tabiiy ravishda nolga yig'iladi. Faqat
 *    aslini filtrlash (eski xatti-harakat) zanjirni uzadi — PRODda 99 ta
 *    uzilish; hammasini olganda 0 ta.
 * 2. `Math.abs` YO'Q. Yo'nalish ishoradan olinadi: `amount > 0` kredit,
 *    `amount < 0` debet. Eski kod bekor qilingan yechimning MUSBAT qarshi
 *    qatorini `Math.abs` bilan yangi dars talabiga aylantirib, pulni ikki
 *    marta undirardi (PRODda 124 qator, 4 572 301 so'm).
 * 3. Tur ro'yxati yo'q. Balansga tegadigan har qanday qator qatnashadi —
 *    ADJUSTMENT, REFUND, INITIAL_BALANCE, DEBT_WRITE_OFF, MOCK_EXAM_FEE,
 *    DISCOUNT_ADJUSTMENT, BALANCE_WITHDRAWAL. Ular allaqachon balansga
 *    ta'sir qilgan, demak ularni "ko'rmaslik" — ta'rifan xato. Eski kod
 *    faqat PAYMENT + LESSON_DEDUCTION ni ko'rardi (254 o'quvchi buzilgan).
 * 4. Nomuvofiqlik bo'lsa — FAIL-CLOSED. `reconciled: false` qaytadi va
 *    chaqiruvchi taqsimotni UMUMAN ko'rsatmaydi. Biz tuzatayotgan nuqson
 *    aynan "ishonchli ko'rinadigan yolg'on son" edi; uni yamalgan son bilan
 *    almashtirish o'sha nuqsonni qonuniylashtirish bo'lardi.
 *
 * Invariantlar
 * ------------
 *   I-1 (qator):   Σcash − Σdebt === row.balanceBefore  (chang yopilgandan keyin)
 *   I-2 (o'quvchi): Σunspent − Σoutstandingdebt === Student.balance
 *   I-3 (karta):   toPreviousDebt + toLessons + toOther + unspent === amount
 *
 * DIQQAT: "Σ balansga qoldi === balans" invarianti MATEMATIK JIHATDAN
 * MUMKIN EMAS — manfiy balansni manfiy bo'lmagan qoldiqlar yig'indisi
 * hech qachon bermaydi. To'g'ri shakli — I-2, qarz tomoni bilan birga.
 */
import { Prisma, TransactionType } from '@prisma/client';

/** Replay uchun kerak bo'ladigan minimal qator (chaqiruvchi shuni tanlaydi). */
export interface ReplayRow {
  id: string;
  type: TransactionType;
  /** Ishorali: > 0 kredit, < 0 debet. Nol qatorlar chaqiruvchida filtrlanadi. */
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
}

/**
 * Bitta LESSON_DEDUCTION paketining bitta darsga to'g'ri keladigan bo'lagi.
 * `date === null` → dars hali o'tilmagan (oldindan to'langan).
 *
 * Pul FIFO'si paket darajasida emas, AYNAN SHU bo'laklar darajasida
 * taqsimlanadi. Aks holda paketning bir qismini moliyalagan to'lov butun
 * paketning sana oralig'ini meros qilib olardi (#10460 da 21.07 to'lovi
 * "21.07 — 04.08" deb ko'rsatilardi, to'g'risi "21.07 — 30.07").
 */
export interface LessonSlice {
  cost: number;
  date: Date | null;
}

/** Bitta kredit qatori (odatda PAYMENT) uchun taqsimot natijasi. */
export interface CreditAllocation {
  amount: number;
  /** Shu puldan avval to'planib qolgan qarzni yopishga ketgani. */
  toPreviousDebt: number;
  debtLessonCount: number;
  debtFirstLessonDate: Date | null;
  debtLastLessonDate: Date | null;
  /** Shu puldan (qarz yopilgandan keyin) darslarga ketgani. */
  toLessons: number;
  lessonCount: number;
  /**
   * `lessonCount` dan ALLAQACHON O'TILGANI — ya'ni sanasi bor qismi.
   * `firstLessonDate`/`lastLessonDate` oralig'i aynan shu darslarni qamraydi,
   * `lessonCount` ni emas. Ikkisi teng bo'lmasa, karta oraliqni butun songa
   * tegishli qilib ko'rsatmasligi kerak (#10601: 10 dars, oraliq 3 tasiniki).
   */
  heldLessonCount: number;
  /** `lessonCount` dan hali O'TILMAGANI — oldindan to'langan darslar. */
  pendingLessonCount: number;
  /**
   * O'sha kutilayotgan darslarni yozgan LESSON_DEDUCTION id'lari. Chaqiruvchi
   * shular orqali guruh jadvalini topib, "qachongacha yetadi" ni proyeksiya
   * qiladi — replay'ning o'zi jadvalni bilmaydi va bilishi ham shart emas.
   */
  pendingDeductionIds: string[];
  firstLessonDate: Date | null;
  lastLessonDate: Date | null;
  /** Dars bo'lmagan yechimlar: pul qaytarish, imtihon to'lovi, withdrawal. */
  toOther: number;
  /** Hali hech narsa sotib olmagan qoldiq. "Balansda bor" degani EMAS. */
  unspent: number;
}

export interface ReplayResult {
  byCredit: Map<string, CreditAllocation>;
  /** Zanjir har qatorda saqlangan balansga mos keldimi. */
  reconciled: boolean;
  unspentTotal: number;
  /** Hali yopilmagan qarz (musbat son). */
  outstandingDebt: number;
}

interface CashFragment {
  creditId: string;
  remaining: number;
}

interface DebtFragment {
  key: string;
  /** Bu bo'lakni yozgan qator — kutilayotgan darslarni paketiga bog'lash uchun. */
  rowId: string;
  remaining: number;
  date: Date | null;
  isLesson: boolean;
}

const blankAllocation = (amount: number): CreditAllocation => ({
  amount,
  toPreviousDebt: 0,
  debtLessonCount: 0,
  debtFirstLessonDate: null,
  debtLastLessonDate: null,
  toLessons: 0,
  lessonCount: 0,
  heldLessonCount: 0,
  pendingLessonCount: 0,
  pendingDeductionIds: [],
  firstLessonDate: null,
  lastLessonDate: null,
  toOther: 0,
  unspent: 0,
});

const widen = (
  current: { first: Date | null; last: Date | null },
  date: Date | null,
) => {
  if (!date) return;
  if (!current.first || date.getTime() < current.first.getTime()) {
    current.first = date;
  }
  if (!current.last || date.getTime() > current.last.getTime()) {
    current.last = date;
  }
};

/**
 * Bir LESSON_DEDUCTION paketini per-dars bo'laklariga ajratadi.
 *
 * `capacity` metadatadan olinadi; metadatasiz eski qatorlar uchun
 * `perLessonCost` dan tiklanadi (PRODda ~128 shunday qator bor va eski kodda
 * ular sig'imi 0 bo'lgani uchun hech qachon dars qabul qilmasdi).
 */
export function splitLessonSlices(
  amount: number,
  metadata: Prisma.JsonValue | null,
  consumedDates: Date[],
): LessonSlice[] {
  const total = Math.abs(amount);
  const md = (metadata ?? {}) as Record<string, unknown>;
  const perLessonCost = Number(md.perLessonCost) || 0;

  let capacity = Number(md.lessonsCovered) || 0;
  if (capacity <= 0) {
    capacity =
      perLessonCost > 0 ? Math.max(1, Math.round(total / perLessonCost)) : 1;
  }

  const unit = Math.floor(total / capacity);
  const slices: LessonSlice[] = [];
  for (let i = 0; i < capacity; i += 1) {
    // Oxirgi bo'lak yaxlitlash qoldig'ini yutadi — Σcost === total kafolati.
    const cost = i === capacity - 1 ? total - unit * (capacity - 1) : unit;
    slices.push({ cost, date: consumedDates[i] ?? null });
  }
  return slices;
}

/**
 * Xronologik replay. `rows` (createdAt, id) ASC tartibida bo'lishi SHART —
 * saralashni chaqiruvchi bajaradi (Prisma `orderBy`).
 *
 * `lessonSlices` — LESSON_DEDUCTION id -> per-dars bo'laklari. Yo'q bo'lsa
 * yechim bitta bo'lakdan iborat deb qaraladi.
 */
export function replayStudentLedger(
  rows: ReplayRow[],
  lessonSlices: Map<string, LessonSlice[]>,
): ReplayResult {
  const byCredit = new Map<string, CreditAllocation>();
  const cash: CashFragment[] = [];
  const debt: DebtFragment[] = [];
  let reconciled = true;

  const cashTotal = () => cash.reduce((sum, f) => sum + f.remaining, 0);
  const debtTotal = () => debt.reduce((sum, f) => sum + f.remaining, 0);

  /**
   * "Chang" — naqd va qarz bir vaqtda turolmaydi: real balans ularning
   * ayirmasi. Har qatordan OLDIN o'zaro yopamiz, shunda `toPreviousDebt`
   * admin ko'radigan SOF qarzga aynan teng bo'ladi.
   *
   * Oxirgi qatordan keyin ATAYLAB yopilmaydi: #10460 da 8 so'm naqd va
   * 33 333 qarz yonma-yon qoladi, chunki 04.08 darsi butunlay to'lanmagan
   * (biller "all-or-nothing" — pastga qarang), 8 so'm esa hech narsa
   * sotib olmagan.
   */
  const netDust = () => {
    while (cash.length && debt.length) {
      const c = cash[0];
      const d = debt[0];
      const take = Math.min(c.remaining, d.remaining);
      const alloc = byCredit.get(c.creditId);
      if (alloc) {
        if (d.isLesson) {
          alloc.toLessons += take;
          countLesson(alloc, d.key, d.date, d.rowId);
        } else {
          alloc.toOther += take;
        }
      }
      c.remaining -= take;
      d.remaining -= take;
      if (c.remaining === 0) cash.shift();
      if (d.remaining === 0) debt.shift();
    }
  };

  // Bir dars bo'lagi ikki kredit o'rtasida bo'linishi mumkin (#10460 da 07.07
  // darsi 25.06 va 21.07 to'lovlari orasida bo'lingan). Pul ikki marta
  // sanalmaydi, lekin DARS SONI har ikkala kartada 1 deb ko'rinadi — shuning
  // uchun har kredit o'zi tekkan bo'laklarni yodda tutadi.
  const lessonKeys = new Map<CreditAllocation, Set<string>>();
  const debtKeys = new Map<CreditAllocation, Set<string>>();

  const countLesson = (
    alloc: CreditAllocation,
    key: string,
    date: Date | null,
    rowId: string,
  ) => {
    const seen = lessonKeys.get(alloc);
    if (seen && !seen.has(key)) {
      seen.add(key);
      alloc.lessonCount += 1;
      // Sanasi yo'q bo'lak = hali o'tilmagan dars. U `lessonCount` ga kiradi
      // (puli to'langan), lekin sana oralig'ini KENGAYTIRMAYDI — shuning
      // uchun ikkalasini alohida sanaymiz, aks holda karta "10 ta dars ·
      // 12.08 — 19.08" deb ikki xil to'plamni bitta qatorda aytadi.
      if (date) {
        alloc.heldLessonCount += 1;
      } else {
        alloc.pendingLessonCount += 1;
        if (!alloc.pendingDeductionIds.includes(rowId)) {
          alloc.pendingDeductionIds.push(rowId);
        }
      }
    }
    const range = { first: alloc.firstLessonDate, last: alloc.lastLessonDate };
    widen(range, date);
    alloc.firstLessonDate = range.first;
    alloc.lastLessonDate = range.last;
  };

  const countDebtLesson = (
    alloc: CreditAllocation,
    key: string,
    date: Date | null,
  ) => {
    const seen = debtKeys.get(alloc);
    if (seen && !seen.has(key)) {
      seen.add(key);
      alloc.debtLessonCount += 1;
    }
    const range = {
      first: alloc.debtFirstLessonDate,
      last: alloc.debtLastLessonDate,
    };
    widen(range, date);
    alloc.debtFirstLessonDate = range.first;
    alloc.debtLastLessonDate = range.last;
  };

  let debtSeq = 0;

  for (const row of rows) {
    netDust();

    // I-1: zanjir saqlangan balansga langarlanadi. Bu tekshiruv MODELni
    // emas, LEDGERni sinaydi — mos kelmasa yolg'on son ko'rsatmaymiz.
    if (cashTotal() - debtTotal() !== row.balanceBefore) reconciled = false;

    if (row.amount > 0) {
      const alloc = blankAllocation(row.amount);
      byCredit.set(row.id, alloc);
      lessonKeys.set(alloc, new Set());
      debtKeys.set(alloc, new Set());

      let credit = row.amount;
      while (credit > 0 && debt.length) {
        const d = debt[0];
        const take = Math.min(credit, d.remaining);
        alloc.toPreviousDebt += take;
        if (d.isLesson) countDebtLesson(alloc, d.key, d.date);
        d.remaining -= take;
        credit -= take;
        if (d.remaining === 0) debt.shift();
      }
      if (credit > 0) cash.push({ creditId: row.id, remaining: credit });
    } else if (row.amount < 0) {
      const total = -row.amount;
      const isLesson = row.type === TransactionType.LESSON_DEDUCTION;
      const slices = isLesson
        ? (lessonSlices.get(row.id) ?? [{ cost: total, date: null }])
        : [{ cost: total, date: null }];

      // Dars yechimi "hammasi yoki hech narsa": biller FULL_CYCLE va
      // PARTIAL rejimlarida hech qachon balansdan oshiq yechmaydi
      // (lesson-billing.service.ts:514/531), SINGLE_UNCOVERED da esa to'liq
      // dars narxini yozib, balansni ataylab minusga tushiradi. Demak
      // |amount| > balanceBefore bo'lsa — bu dars UMUMAN to'lanmagan.
      // Boshqa turdagi debet (REFUND, withdrawal, imtihon) uchun esa
      // ledger qisman moliyalashni ko'rsatadi — o'shanda min() ishlatamiz.
      const available = Math.max(0, row.balanceBefore);
      const funded = isLesson
        ? total <= available
          ? total
          : 0
        : Math.min(total, available);

      let fundedLeft = funded;
      for (const slice of slices) {
        let need = slice.cost;
        debtSeq += 1;
        const key = `${row.id}#${debtSeq}`;

        while (need > 0 && fundedLeft > 0 && cash.length) {
          const c = cash[0];
          const take = Math.min(need, c.remaining, fundedLeft);
          const alloc = byCredit.get(c.creditId);
          if (alloc) {
            if (isLesson) {
              alloc.toLessons += take;
              countLesson(alloc, key, slice.date, row.id);
            } else {
              alloc.toOther += take;
            }
          }
          c.remaining -= take;
          need -= take;
          fundedLeft -= take;
          if (c.remaining === 0) cash.shift();
        }

        if (need > 0) {
          debt.push({
            key,
            rowId: row.id,
            remaining: need,
            date: slice.date,
            isLesson,
          });
        }
      }
    }

    if (cashTotal() - debtTotal() !== row.balanceAfter) reconciled = false;
  }

  // Qolgan naqd — hech narsa sotib olmagan pul.
  for (const fragment of cash) {
    const alloc = byCredit.get(fragment.creditId);
    if (alloc) alloc.unspent += fragment.remaining;
  }

  return {
    byCredit,
    reconciled,
    unspentTotal: cashTotal(),
    outstandingDebt: debtTotal(),
  };
}
