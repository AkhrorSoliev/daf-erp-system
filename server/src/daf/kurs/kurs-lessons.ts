import type { KursUnitSpec } from './kurs.types';

export type LessonKind = 'SECTION_A' | 'SECTION_B' | 'BRIDGE' | 'UNIT_TEST';

export interface PlannedLesson {
  order: number;
  sourceId: string;
  kind: LessonKind;
  /** O'tish sinovi O'ZI TUGATGAN bo'limga bog'lanadi; unit yakuni — `null`. */
  sectionCode: string | null;
  titleDe: string;
  titleUz: string;
}

/**
 * Seansning barqaror kaliti. Seed shu bo'yicha yangilaydi, takrorlamaydi —
 * `order` bo'yicha bog'lash bo'lim qo'shilganda hamma seansni siljitardi.
 */
export function lessonSourceId(
  unitCode: string,
  kind: LessonKind,
  sectionOrder?: number,
): string {
  if (kind === 'UNIT_TEST') return `${unitCode}-test`;
  // `sectionOrder` UNIT_TEST'dan boshqa har bir tur uchun majburiy.
  // Sukut bilan o'tkazib yuborilsa, `String(undefined)` "undefined"ga
  // aylanib, `u01-sundefined-a` kabi jimgina buzuq kalit yasardi —
  // xato chaqiruvni faqat bazadagi g'alati sourceId orqali topish kerak
  // bo'lardi. Shu yerda darhol, ovoz bilan to'xtaydi.
  if (sectionOrder === undefined) {
    throw new Error(
      `lessonSourceId: "${kind}" bo'lim tartibisiz chaqirildi (unit "${unitCode}") — ` +
        'bu tur uchun sectionOrder majburiy.',
    );
  }
  const s = String(sectionOrder).padStart(2, '0');
  if (kind === 'BRIDGE') return `${unitCode}-s${s}-bridge`;
  return `${unitCode}-s${s}-${kind === 'SECTION_A' ? 'a' : 'b'}`;
}

/**
 * Unitning seans ro'yxatini quradi: har bo'limga ikki dars, bo'limlar
 * orasiga o'tish sinovi, oxirida unit yakuni.
 *
 * O'tish sinovi OXIRGI bo'limdan keyin qo'yilmaydi — undan keyin darhol
 * unit yakuni keladi va ikkalasi bir xil ishni qilardi.
 */
export function planLessons(unit: KursUnitSpec): PlannedLesson[] {
  const lessons: PlannedLesson[] = [];
  const push = (
    kind: LessonKind,
    sectionCode: string | null,
    titleDe: string,
    titleUz: string,
    sectionOrder?: number,
  ): void => {
    lessons.push({
      order: lessons.length + 1,
      sourceId: lessonSourceId(unit.code, kind, sectionOrder),
      kind,
      sectionCode,
      titleDe,
      titleUz,
    });
  };

  unit.sections.forEach((s, i) => {
    push('SECTION_A', s.code, s.titleDe, `${s.titleUz} — tanishuv`, s.order);
    push('SECTION_B', s.code, s.titleDe, `${s.titleUz} — ishlatish`, s.order);
    if (i < unit.sections.length - 1) {
      push(
        'BRIDGE',
        s.code,
        `${s.titleDe} — Wiederholung`,
        `${s.titleUz} — o'tish sinovi`,
        s.order,
      );
    }
  });

  push('UNIT_TEST', null, 'Kurz und klar', `${unit.titleUz} — yakuniy sinov`);

  return lessons;
}
