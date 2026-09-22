/**
 * Unit yakuniy sinovi («Kurz und klar») qoidalari — BITTA JOY.
 *
 * Dizayn: `docs/superpowers/specs/2026-09-14-a1-yakuniy-sinov-design.md`.
 * CEO qarori (2026-09-14): 15 savol, birinchi urinishda kamida 90 %
 * to'g'ri bo'lsa keyingi unit ochiladi.
 *
 * NEGA FOIZ BUTUN SON. `Math.ceil(0.9 * n)` suzuvchi nuqtada ba'zi `n`
 * uchun bir ortiq talab qiladi (0.9 × 10 = 9.000000000000002 → 10).
 * Butun sonli `n × 90 / 100` bu xatodan xoli.
 */
export const UNIT_TEST_SAVOLLAR = 15;
export const OTISH_FOIZI = 90;

/** O'tish uchun kerakli to'g'ri javoblar soni: 15 savolda 14 ta. */
export function otishUchunKerak(jami: number = UNIT_TEST_SAVOLLAR): number {
  return Math.ceil((jami * OTISH_FOIZI) / 100);
}

/**
 * Seans natijasidan o'tish qarori.
 *
 * `questionCount` urinishlardan hisoblanadi (birinchi urinish,
 * baholangan). To'liq 15 savolga javob berilmagan seans O'TMAYDI:
 * aks holda 3 ta oson savolga javob berib yakun yuborish 3/3 = 100 %
 * bo'lib qolardi.
 */
export function sinovdanOtdimi(natija: {
  questionCount: number;
  firstTryCorrect: number;
}): boolean {
  return (
    natija.questionCount >= UNIT_TEST_SAVOLLAR &&
    natija.firstTryCorrect >= otishUchunKerak()
  );
}
