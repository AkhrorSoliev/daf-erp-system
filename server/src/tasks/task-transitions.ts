import type { TaskKind, TaskStatus } from '@prisma/client';

export type TransitionBy = 'ASSIGNEE' | 'MANAGER';

export const OPEN_STATUSES: readonly TaskStatus[] = [
  'NEW',
  'IN_PROGRESS',
  'IN_REVIEW',
];

export const PHOTO_REQUIRED_MESSAGE =
  "Tekshiruvga yuborish uchun rasm qo'shing";
export const SYSTEM_CLOSES_MESSAGE = "Bu topshiriqni tizim o'zi yopadi";
/** The refusal to anybody but the giver (or a manager); the Telegram button shows it too. */
export const ONLY_GIVER_REVIEWS = 'Faqat beruvchi tekshira oladi';

type Args = {
  from: TaskStatus;
  to: TaskStatus;
  by: TransitionBy;
  /** Author is the only assignee: skips the review step. */
  selfTask: boolean;
  kind: TaskKind;
  requiresPhoto: boolean;
  hasFreshPhoto: boolean;
};

/** Spec 2026-10-07 §3.2, one table. */
export function checkTransition(
  a: Args,
): { ok: true } | { ok: false; message: string } {
  const no = (message: string) => ({ ok: false as const, message });
  if (a.from === a.to) return no('Holat allaqachon shunday');
  if (!OPEN_STATUSES.includes(a.from))
    return no('Yopilgan topshiriq qayta ochilmaydi');

  if (a.kind !== 'MANUAL') {
    if (a.by === 'ASSIGNEE' && a.from === 'NEW' && a.to === 'IN_PROGRESS')
      return { ok: true };
    return no(SYSTEM_CLOSES_MESSAGE);
  }

  if (a.by === 'MANAGER') {
    if (a.to === 'CANCELLED') return { ok: true };
    if (a.from === 'IN_REVIEW' && (a.to === 'DONE' || a.to === 'IN_PROGRESS'))
      return { ok: true };
    return no("Bu o'tish beruvchiga ruxsat etilmagan");
  }

  // ASSIGNEE
  if (a.from === 'NEW' && a.to === 'IN_PROGRESS') return { ok: true };
  if (a.selfTask) {
    if ((a.from === 'NEW' || a.from === 'IN_PROGRESS') && a.to === 'DONE')
      return { ok: true };
    return no("O'zingizga yozilgan topshiriqda tekshiruv bosqichi yo'q");
  }
  if ((a.from === 'NEW' || a.from === 'IN_PROGRESS') && a.to === 'IN_REVIEW') {
    if (a.requiresPhoto && !a.hasFreshPhoto) return no(PHOTO_REQUIRED_MESSAGE);
    return { ok: true };
  }
  return no("Bu o'tish ijrochiga ruxsat etilmagan");
}
