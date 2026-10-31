/**
 * To'lov yo'qligi uchun davomat olib bo'lmagan darslar (ADR-0047, ADR-0142).
 *
 * 2-darsdan keyin to'lamagan o'quvchiga "Keldi", "Kelmadi", "Kechikdi"
 * qo'yib bo'lmaydi, shuning uchun u davomat qatori qoldirmaydi. Qatorning
 * yo'qligi — shu holatning o'zi. Bu fayl faqat sof qoidani saqlaydi; hukmni
 * (`LessonAdmissionService`) va bazadan o'qishni `BarredLessonsService` qo'shadi.
 *
 * Sanalar — Toshkent kunlari, 'YYYY-MM-DD' matni (leksikografik taqqoslanadi).
 */
export interface BarredDaysInput {
  /** Oylik hisobning qoplangan sanalari (bir necha oy bo'lishi mumkin). */
  coveredDates: string[];
  /** Hisobdan chiqarilgan sanalar (bekor qilingan dars, ketgandan keyingi kunlar). */
  frozenOutDates: string[];
  /** Guruhda ustoz kamida bitta o'quvchiga davomat belgilagan kunlar. */
  heldDays: ReadonlySet<string>;
  /** Shu o'quvchida davomat qatori bor kunlar (har qanday holat). */
  markedDays: ReadonlySet<string>;
  /** Shu sanadan boshlab (kiritilgan). */
  from: string;
  /** Shu sanagacha (kiritilmagan), odatda bugun. */
  to: string;
  /** Hisobdan chiqarilgan kunlarni ham ko'rsatish (profil tabi, qaytish oynasi). */
  includeFrozenOut: boolean;
}

export function barredLessonDays(input: BarredDaysInput): string[] {
  const frozen = new Set(input.includeFrozenOut ? [] : input.frozenOutDates);
  const days = new Set<string>();
  for (const d of input.coveredDates) {
    if (d < input.from || d >= input.to) continue;
    if (frozen.has(d) || !input.heldDays.has(d) || input.markedDays.has(d)) {
      continue;
    }
    days.add(d);
  }
  return [...days].sort();
}

/**
 * Oxirgi o'tgan darsdan orqaga: "Kelmadi" (ABSENT) yoki davomat olib
 * bo'lmagan kunlar soni. Boshqa har qanday belgi (Keldi, Kech, Sababli)
 * ketma-ketlikni uzadi.
 */
export function barredStreak(
  heldDaysAsc: string[],
  rowByDay: ReadonlyMap<string, 'MARKED' | 'ABSENT'>,
  barred: ReadonlySet<string>,
): number {
  let count = 0;
  for (let i = heldDaysAsc.length - 1; i >= 0; i--) {
    const day = heldDaysAsc[i];
    const row = rowByDay.get(day);
    if (row === 'ABSENT' || (row === undefined && barred.has(day))) count++;
    else break;
  }
  return count;
}

/** CEO sozlamasi: olti mustaqil katak (`absence.barred.*`, ADR-0142). */
export interface BarredFlags {
  mark: boolean;
  nudge: boolean;
  warn: boolean;
  autoPause: boolean;
  pauseNotice: boolean;
  logOnly: boolean;
}

/**
 * Talabi bajarilmagan katak o'chiq hisoblanadi: 1, 2-dars xabari va avto-pauza
 * `mark` ga tayanadi; 3-dars xabari `autoPause` ga.
 * `logOnly` mustaqil (u qo'shimcha xavfsizlik, shuning uchun hech narsaga
 * bog'lanmagan).
 */
export function effectiveBarredFlags(raw: BarredFlags): BarredFlags {
  const mark = raw.mark;
  const autoPause = mark && raw.autoPause;
  return {
    mark,
    nudge: mark && raw.nudge,
    warn: mark && raw.warn,
    autoPause,
    pauseNotice: autoPause && raw.pauseNotice,
    logOnly: raw.logOnly,
  };
}
