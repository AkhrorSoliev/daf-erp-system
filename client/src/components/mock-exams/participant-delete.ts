/**
 * Ishtirokchini o'chirish qoidasi. To'lagan odamning ro'yxati o'chirilsa,
 * uning puli mock daromadidan tushib qoladi va qayta yozilsa undan yana
 * to'lov so'raladi — shuning uchun admin pulni qaytarganini ochiq
 * tasdiqlashi shart. Server ham xuddi shu tasdiqni talab qiladi.
 */
export function canConfirmDelete(
  participant: { paid: boolean },
  refundAcknowledged: boolean,
): boolean {
  return !participant.paid || refundAcknowledged;
}

export function deleteRequestParams(
  participant: { paid: boolean },
  refundAcknowledged: boolean,
): { refundConfirmed: true } | undefined {
  return participant.paid && refundAcknowledged
    ? { refundConfirmed: true }
    : undefined;
}
