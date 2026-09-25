/**
 * Ishtirokchi to'lashi kerak bo'lgan summa: ro'yxatdan o'tishda qotirilgan
 * `feeAmount` (DaF chegirmasi bilan). Imtihonning joriy narxi faqat
 * feeAmount'siz eski qatorlar uchun — server ham xuddi shunday hisoblaydi.
 */
export function participantFee(
  participant: { feeAmount?: number | null },
  examPrice: number,
): number {
  return participant.feeAmount ?? examPrice;
}

export type MockPaymentState = "paid" | "pending" | "free";

export function mockPaymentState(
  participant: { paid: boolean; feeAmount?: number | null },
  examPrice: number,
): MockPaymentState {
  if (participant.paid) return "paid";
  return participantFee(participant, examPrice) > 0 ? "pending" : "free";
}
