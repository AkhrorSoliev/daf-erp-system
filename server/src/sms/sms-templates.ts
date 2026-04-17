export interface EnrollmentMessagePayload {
  groupName: string;
  courseName: string;
  days: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
}

export interface RemovalMessagePayload {
  groupName: string;
  reason: string;
}

const daysMap: Record<string, string> = {
  odd: 'Toq kunlar (Du, Cho, Ju)',
  even: 'Juft kunlar (Se, Pa, Sha)',
};

const weekdayMap: Record<string, string> = {
  monday: 'Dushanba',
  tuesday: 'Seshanba',
  wednesday: 'Chorshanba',
  thursday: 'Payshanba',
  friday: 'Juma',
  saturday: 'Shanba',
  sunday: 'Yakshanba',
};

export function buildEnrollmentMessage(
  payload: EnrollmentMessagePayload,
): string {
  const daysLabel = payload.days
    ? (daysMap[payload.days] ?? payload.days)
    : payload.exactDays.map((d) => weekdayMap[d] ?? d).join(', ');

  const timeLabel =
    payload.lessonStartTime && payload.lessonEndTime
      ? `${payload.lessonStartTime} – ${payload.lessonEndTime}`
      : '';

  return [
    "✅ <b>Guruhga qo'shildingiz</b>",
    '',
    `📚 Guruh: <b>${payload.groupName}</b>`,
    `🎯 Kurs: ${payload.courseName}`,
    daysLabel ? `📅 Kunlar: ${daysLabel}` : null,
    timeLabel ? `🕐 Vaqt: ${timeLabel}` : null,
    '',
    'Muvaffaqiyat tilaymiz!',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function buildRemovalMessage(payload: RemovalMessagePayload): string {
  return [
    '❌ <b>Guruhdan chiqarildingiz</b>',
    '',
    `📚 Guruh: <b>${payload.groupName}</b>`,
    `📝 Sabab: ${payload.reason}`,
    '',
    "Qo'shimcha ma'lumot uchun administratsiya bilan bog'laning.",
  ].join('\n');
}
