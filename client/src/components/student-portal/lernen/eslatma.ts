import type { Fortschritt } from "./types";

/**
 * «Darajam» dagi «Telegram eslatmalari» qatorining holati (spec S4 §7).
 * Botga ulanmagan o'quvchida almashtirgich faol emas — sozlama nima bo'lishidan
 * qat'i nazar. Eski server maydonlarni yubormaydi: qator chizilmaydi.
 */
export type EslatmaHolati = "yoqilgan" | "ochirilgan" | "ulanmagan";

export function eslatmaHolati(
  f: Pick<Fortschritt, "eslatmalar" | "telegramUlangan">,
): EslatmaHolati | null {
  if (f.eslatmalar === undefined || f.telegramUlangan === undefined) return null;
  if (!f.telegramUlangan) return "ulanmagan";
  return f.eslatmalar ? "yoqilgan" : "ochirilgan";
}

export const ESLATMA_SARLAVHA = "Telegram eslatmalari";
export const ESLATMA_IZOH = "Kechki eslatma va dushanba xulosasi";
export const ULANMAGAN_IZOH = "Botga ulang";
export const SAQLANMADI = "Saqlab bo'lmadi. Qayta urinib ko'ring";
