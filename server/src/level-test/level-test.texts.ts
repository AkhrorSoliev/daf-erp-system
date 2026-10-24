import type { LevelTestResult } from './level-test.types';

export const LEVEL_TEST_INTRO =
  "📊 Daraja testi\n\nNemis tilidagi bilimingizni aniqlaymiz. Savollar oddiydan murakkabga boradi, har birida bitta to'g'ri javob bor.\n\nHar savolga vaqt beriladi: vaqt tugasa, javob hisobga olinmaydi va keyingi savolga o'tiladi. Bilmasangiz — taxmin qiling, hech narsa yo'qotmaysiz. Testni to'xtatish uchun /cancel yozing.";

export const LEVEL_TEST_TIMEOUT_NOTE =
  '⏱ Vaqt tugadi — javob hisobga olinmadi.';

export const LEVEL_TEST_ABANDONED =
  "Test to'xtatildi: ketma-ket bir necha savolga javob bermadingiz. Qayta urinish uchun /start bosing.";

export const LEVEL_TEST_PHONE_PROMPT =
  "Natijangizni saqlash va sizga mos guruhni tanlashda yordam berish uchun telefon raqamingizni yuboring — administratorimiz siz bilan bog'lanadi.";

export const LEVEL_TEST_LATER_BUTTON = 'Keyinroq';

export const LEVEL_TEST_LATER_REPLY =
  'Mayli. Xohlasangiz, /start bosib testni qayta ishlashingiz mumkin — har safar yangi savollar chiqadi.';

export const LEVEL_TEST_BRANCH_PROMPT = "Qaysi filialda o'qimoqchisiz?";

export const LEVEL_TEST_LEAD_DONE =
  "✅ Rahmat! Administratorimiz tez orada siz bilan bog'lanadi.";

export const LEVEL_TEST_NO_BRANCH =
  "Hozircha filiallarni ko'rsata olmayapman. Natijangiz saqlandi — administrator bilan bog'laning.";

export const LEVEL_TEST_STALE = 'Bu savol allaqachon javob olgan.';

export const LEVEL_TEST_FAILED =
  "Xatolik yuz berdi. Keyinroq qayta urinib ko'ring.";

const RESULT_LINE: Record<LevelTestResult, string> = {
  BEGINNER:
    "A1 dan past (boshlang'ich). Nemis tilini noldan boshlash sizga mos.",
  A1: "taxminan A1 (boshlang'ich daraja).",
  A2: 'taxminan A2 (elementar daraja).',
  B1: "taxminan B1 (o'rta daraja).",
  B2: "B2 yoki undan yuqori (o'rta-yuqori daraja).",
};

export const LEVEL_TEST_RESULT_LABEL: Record<LevelTestResult, string> = {
  BEGINNER: 'A1 dan past',
  A1: 'A1',
  A2: 'A2',
  B1: 'B1',
  B2: 'B2+',
};

export function levelTestResultText(
  result: LevelTestResult,
  correct: number,
  asked: number,
): string {
  return (
    `📊 Natija: ${RESULT_LINE[result]}\n` +
    `To'g'ri javoblar: ${correct} / ${asked}.\n\n` +
    "Bu taxminiy natija — aniq darajani markaz o'qituvchisi suhbatda belgilaydi."
  );
}

export function levelTestQuestionText(
  n: number,
  text: string,
  seconds?: number,
): string {
  const timer = seconds ? ` · ⏱ ${seconds} soniya` : '';
  return `Savol ${n}${timer}\n\n${text}`;
}

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function levelTestOptionLabel(index: number, option: string): string {
  return `${LETTERS[index] ?? '?'}) ${option}`;
}
