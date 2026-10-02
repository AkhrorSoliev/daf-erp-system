import type { UnmarkedLessonNotHeldPayload } from '../../unmarked-lessons/unmarked-lesson-events';
import { escapeHtml, formatSum } from './format.util';

const day = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
};

/** The instant group notice for «Bo'lmadi» (spec 2026-09-29 §3.5). */
export function notHeldGroupText(
  p: UnmarkedLessonNotHeldPayload,
  decidedByName: string,
): string {
  const lines = [
    "❌ <b>Dars bo'lmadi</b>",
    `👥 ${escapeHtml(p.groupName)} — ${day(p.date)} ${p.lessonStartTime}–${p.lessonEndTime}`,
    `📝 Sabab: ${escapeHtml(p.reason)}`,
  ];
  if (p.outcome === 'CANCELLED') {
    lines.push(
      `💰 Pul qaytarildi: ${p.refundedStudents ?? 0} o'quvchi, ${formatSum(p.refundedAmount ?? 0)}`,
    );
  } else if (p.newDate) {
    const time =
      p.newLessonStartTime && p.newLessonEndTime
        ? ` ${p.newLessonStartTime}–${p.newLessonEndTime}`
        : '';
    lines.push(`📅 Ko'chirildi: ${day(p.newDate)}${time}`);
  }
  lines.push(`👤 Belgilagan: ${escapeHtml(decidedByName)}`);
  return lines.join('\n');
}
