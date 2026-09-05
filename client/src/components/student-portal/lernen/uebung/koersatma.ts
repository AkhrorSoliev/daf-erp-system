import type { FrageFormat } from "../types";

/**
 * Savol ustidagi bir qatorlik ko'rsatma.
 *
 * Server buni yubormaydi: bu interfeys matni, kontent emas. Serverga
 * qo'yilsa, matnni o'zgartirish uchun backend deploy kerak bo'lardi.
 */
const MATN: Record<FrageFormat, string> = {
  WORT_UZ: "Bu so'z nimani anglatadi?",
  UZ_WORT: "Nemischasini tanlang",
  PAAR: "So'zlarni tarjimasi bilan juftlang",
  ARTIKEL: "Artiklni tanlang",
  LUECKE: "Bo'sh joyni to'ldiring",
  SATZ_BAUEN: "So'zlardan gap tuzing",
  SATZ_UEBERSETZEN: "Gapning tarjimasini tanlang",
  REAKTION: "Nima deb javob berasiz?",
};

export function koersatma(format: FrageFormat): string {
  return MATN[format];
}

/** Format qaysi komponent bilan ko'rsatiladi (dizayn §4.1). */
export function harakat(format: FrageFormat): "TANLASH" | "YOZISH" | "YIGISH" {
  if (format === "LUECKE") return "YOZISH";
  if (format === "SATZ_BAUEN" || format === "PAAR") return "YIGISH";
  return "TANLASH";
}
