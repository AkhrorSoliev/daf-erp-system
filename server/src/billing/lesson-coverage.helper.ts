/**
 * Sikl (cycle) qoplamasini ledger'dan qayta tiklash — yagona manba.
 *
 * Sikl = N dars (N = Course.lessonPaymentCount). Sikl boshlanish/tugash sanasi
 * hech qayerda saqlanmaydi; u LESSON_DEDUCTION (sikl ochilishi) + ularga FIFO
 * taqsimlangan LESSON_CONSUMPTION (har dars) qatorlaridan hisoblanadi.
 *
 * Bu modul ilgari TransactionsReadService ichida dublikat bo'lgan
 * computeDeductionCoverage / computeDeductionDates mantig'ini yagona joyga
 * yig'adi, shunda Transactions, Payments-debtors va Students-lessons-overview
 * hammasi bir xil dvigateldan foydalanadi.
 *
 * Muhim invariantlar (o'zgartirilmasin):
 *   - Tartib `createdAt` ASC bo'yicha (retroaktiv billing deduction'ni darsdan
 *     keyin yozishi mumkin — lekin FIFO ketma-ketlik createdAt bo'yicha).
 *   - Sana esa `attendance.date` dan olinadi (createdAt emas) — haqiqiy dars
 *     sanasi.
 *   - Faqat reversedAt: null qatorlar (bekor qilinganlar chiqarib tashlanadi).
 *   - Sikl raqami (cycleSequenceNumber) har enrollment ichida 1 dan boshlanadi.
 */
import { Prisma, TransactionType } from '@prisma/client';

export interface CoverageTx {
  id: string;
  type: TransactionType;
  /** Ishorali summa — metadatasiz qatorlarda sig'imni tiklash uchun kerak. */
  amount: number;
  enrollmentId: string | null;
  attendanceId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface CycleCoverage {
  /** Sikl ochilgan LESSON_DEDUCTION tegishli enrollment (guruhlash uchun). */
  enrollmentId: string | null;
  cycleSequenceNumber: number;
  capacity: number;
  coveredCount: number;
  firstCoveredDate: Date | null;
  lastCoveredDate: Date | null;
  /**
   * Shu paket qoplagan darslarning sanalari, o'sish tartibida.
   * `ledger-replay` pul FIFO'sini paket darajasida emas, AYNAN SHU sanalar
   * darajasida taqsimlaydi — aks holda paketning bir qismini moliyalagan
   * to'lov butun paketning sana oralig'ini meros qilib olardi.
   */
  consumedDates: Date[];
}

export interface CoverageResult {
  /** LESSON_DEDUCTION tranzaksiya id -> uning sikl qoplamasi. */
  byDeduction: Map<string, CycleCoverage>;
  /** LESSON_CONSUMPTION attendanceId -> uni qoplagan sikl raqami. */
  cycleByAttendanceId: Map<string, number>;
}

/**
 * Sof (Prisma'siz) FIFO taqsimlovchi. Kirish — bir nechta enrollment'ning
 * LESSON_DEDUCTION + LESSON_CONSUMPTION qatorlari (reversedAt: null bo'lishi
 * KUTILADI) va attendanceId -> sana xaritasi.
 */
export function allocateCoverage(
  txs: CoverageTx[],
  attDateMap: Map<string, Date>,
): CoverageResult {
  const byDeduction = new Map<string, CycleCoverage>();
  const cycleByAttendanceId = new Map<string, number>();

  // Enrollment bo'yicha guruhlash.
  const byEnrollment = new Map<string, CoverageTx[]>();
  for (const tx of txs) {
    if (!tx.enrollmentId) continue;
    const list = byEnrollment.get(tx.enrollmentId) ?? [];
    list.push(tx);
    byEnrollment.set(tx.enrollmentId, list);
  }

  for (const [, list] of byEnrollment) {
    // createdAt ASC — deterministik FIFO.
    // createdAt ASC. Bitta tranzaksiyada yozilgan yechim va iste'mol bir xil
    // `createdAt` ga ega bo'lishi mumkin, shuning uchun teng vaqtda TUR
    // hal qiladi: sikl avval OCHILADI, keyin undan dars iste'mol qilinadi.
    // (Faqat `id` bo'yicha tiebreak qilish iste'molni o'z paketidan oldinga
    // o'tkazib yuborardi va dars butunlay yo'qolardi.)
    const typeRank = (t: CoverageTx) =>
      t.type === TransactionType.LESSON_DEDUCTION ? 0 : 1;
    const ordered = [...list].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        typeRank(a) - typeRank(b) ||
        a.id.localeCompare(b.id),
    );

    let cycleSeq = 0;
    const buckets: Array<{
      deductionId: string;
      cycleSequenceNumber: number;
      capacity: number;
      consumedDates: Date[];
    }> = [];

    for (const tx of ordered) {
      if (tx.type === TransactionType.LESSON_DEDUCTION) {
        cycleSeq += 1;
        const md = (tx.metadata ?? {}) as Record<string, unknown>;
        // Metadatasiz eski qatorlar (PRODda ~128 ta) uchun sig'imni summadan
        // tiklaymiz — aks holda `capacity = 0` bo'lib, bucket hech qachon
        // dars qabul qilmaydi va darslar jimgina yo'qoladi.
        const perLessonCost = Number(md.perLessonCost) || 0;
        const declared = Number(md.lessonsCovered) || 0;
        const capacity =
          declared > 0
            ? declared
            : perLessonCost > 0
              ? Math.max(1, Math.round(Math.abs(tx.amount) / perLessonCost))
              : 1;
        buckets.push({
          deductionId: tx.id,
          cycleSequenceNumber: cycleSeq,
          capacity,
          consumedDates: [],
        });
        byDeduction.set(tx.id, {
          enrollmentId: tx.enrollmentId,
          cycleSequenceNumber: cycleSeq,
          capacity,
          coveredCount: 0,
          firstCoveredDate: null,
          lastCoveredDate: null,
          consumedDates: [],
        });
      } else if (tx.type === TransactionType.LESSON_CONSUMPTION) {
        // Eng eski to'lmagan bucketga quyamiz (FIFO). Bo'sh joy qolmasa
        // darsni TASHLAB YUBORMAYMIZ — oxirgi bucketga overflow qilamiz.
        // Eski `continue` shu yerda darsni jimgina yo'qotardi.
        const bucket =
          buckets.find((b) => b.consumedDates.length < b.capacity) ??
          buckets[buckets.length - 1];
        if (!bucket) continue;
        const date = tx.attendanceId
          ? attDateMap.get(tx.attendanceId)
          : undefined;
        bucket.consumedDates.push(date ?? tx.createdAt);
        if (tx.attendanceId) {
          cycleByAttendanceId.set(tx.attendanceId, bucket.cycleSequenceNumber);
        }
      }
    }

    // Har bucket bo'yicha yakuniy statistikani hisoblash.
    for (const bucket of buckets) {
      const entry = byDeduction.get(bucket.deductionId);
      if (!entry) continue;
      const sorted = [...bucket.consumedDates].sort(
        (a, b) => a.getTime() - b.getTime(),
      );
      entry.coveredCount = sorted.length;
      entry.firstCoveredDate = sorted[0] ?? null;
      entry.lastCoveredDate = sorted[sorted.length - 1] ?? null;
      entry.consumedDates = sorted;
    }
  }

  return { byDeduction, cycleByAttendanceId };
}

/** Minimal Prisma yuzasi — service ham, spec mock'i ham qondiradi. */
export interface CoveragePrismaLike {
  transaction: {
    findMany(args: {
      where: Prisma.TransactionWhereInput;
      select: {
        id: true;
        type: true;
        amount: true;
        enrollmentId: true;
        attendanceId: true;
        metadata: true;
        createdAt: true;
      };
      orderBy: Array<{ createdAt: 'asc' } | { id: 'asc' }>;
    }): Promise<CoverageTx[]>;
  };
  attendance: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; date: true };
    }): Promise<Array<{ id: string; date: Date }>>;
  };
}

/**
 * Berilgan enrollment'lar uchun ledger'ni o'qib, sikl qoplamasini hisoblaydi.
 * Reversed qatorlar query darajasida (reversedAt: null) chiqarib tashlanadi.
 */
export async function computeEnrollmentCoverage(
  prisma: CoveragePrismaLike,
  enrollmentIds: string[],
): Promise<CoverageResult> {
  if (enrollmentIds.length === 0) {
    return { byDeduction: new Map(), cycleByAttendanceId: new Map() };
  }

  const txs = await prisma.transaction.findMany({
    where: {
      enrollmentId: { in: enrollmentIds },
      type: {
        in: [
          TransactionType.LESSON_DEDUCTION,
          TransactionType.LESSON_CONSUMPTION,
        ],
      },
      reversedAt: null,
      // Bekor qilingan qatorning QARSHI qatori ham `reversedAt: null` bilan
      // yuradi — faqat `reversedAt` ni filtrlash uni "yangi iste'mol" deb
      // sanashga olib kelardi (PRODda 189 qator). Bu yerda sanash — pul
      // emas, DARS sanashi, shuning uchun juftlikning IKKALASI ham chiqadi.
      reversedTransactionId: null,
    },
    select: {
      id: true,
      type: true,
      amount: true,
      enrollmentId: true,
      attendanceId: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const consumptionAttIds = txs
    .filter(
      (t) => t.type === TransactionType.LESSON_CONSUMPTION && !!t.attendanceId,
    )
    .map((t) => t.attendanceId as string);

  const attendanceDates = consumptionAttIds.length
    ? await prisma.attendance.findMany({
        where: { id: { in: consumptionAttIds } },
        select: { id: true, date: true },
      })
    : [];
  const attDateMap = new Map(attendanceDates.map((a) => [a.id, a.date]));

  return allocateCoverage(txs, attDateMap);
}
