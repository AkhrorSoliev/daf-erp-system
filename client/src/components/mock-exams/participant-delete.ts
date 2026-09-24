/**
 * Ishtirokchini o'chirish qoidasi. To'lagan odamning ro'yxati o'chirilsa,
 * uning puli mock daromadidan tushib qoladi va qayta yozilsa undan yana
 * to'lov so'raladi — shuning uchun admin pulni qaytarganini ochiq
 * tasdiqlashi shart. Server ham xuddi shu tasdiqni talab qiladi.
 *
 * Istisno — 2026-08 gacha balansdan yechilgan to'lov (`paidFromBalance`):
 * uni server o'chirishda o'zi balansga qaytaradi, tasdiq kerak emas (aks
 * holda admin naqd ham berib, pul ikki marta qaytib ketardi).
 */
type DeletableParticipant = { paid: boolean; paidFromBalance?: boolean };

export function needsRefundConfirmation(
  participant: DeletableParticipant,
): boolean {
  return participant.paid && !participant.paidFromBalance;
}

export function canConfirmDelete(
  participant: DeletableParticipant,
  refundAcknowledged: boolean,
): boolean {
  return !needsRefundConfirmation(participant) || refundAcknowledged;
}

export function deleteRequestParams(
  participant: DeletableParticipant,
  refundAcknowledged: boolean,
): { refundConfirmed: true } | undefined {
  return needsRefundConfirmation(participant) && refundAcknowledged
    ? { refundConfirmed: true }
    : undefined;
}

/**
 * O'chirishdan keyin qaysi sahifa ko'rsatiladi. Sahifadagi oxirgi qator
 * o'chsa, oldingi sahifaga o'tiladi — aks holda jadval bo'sh qolib,
 * sahifalash ham yashirinardi.
 */
export function pageAfterRemoval(page: number, rowsOnPage: number): number {
  return rowsOnPage <= 1 && page > 1 ? page - 1 : page;
}
