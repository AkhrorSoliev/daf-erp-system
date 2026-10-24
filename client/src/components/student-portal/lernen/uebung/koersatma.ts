import { msg } from "@/i18n/msg";
import type { FrageFormat } from "../types";

/**
 * Savol ustidagi bir qatorlik ko'rsatma.
 *
 * Server buni yubormaydi: bu interfeys matni, kontent emas. Serverga
 * qo'yilsa, matnni o'zgartirish uchun backend deploy kerak bo'lardi.
 */
const MATN: Record<FrageFormat, string> = {
  WORT_UZ: msg("Bu so'z nimani anglatadi?"),
  UZ_WORT: msg("Nemischasini tanlang"),
  PAAR: msg("So'zlarni tarjimasi bilan juftlang"),
  ARTIKEL: msg("Artiklni tanlang"),
  LUECKE: msg("Bo'sh joyni to'ldiring"),
  SATZ_BAUEN: msg("So'zlardan gap tuzing"),
  SATZ_HOEREN: msg("Eshitgan gapingizni so'zlardan tuzing"),
  SATZ_UEBERSETZEN: msg("Gapning tarjimasini tanlang"),
  REAKTION: msg("Nima deb javob berasiz?"),
  ZUORDNEN: msg("Vaziyatni mos ibora bilan juftlang"),
  DIALOG_LUECKE: msg("Suhbatda nima aytilgan?"),
  AUDIO_WORT: msg("Eshiting va to'g'ri so'zni tanlang"),
  WORT_TIPPEN: msg("Eshiting va so'zni yozing"),
  HOEREN_WAHL: msg("Suhbatni tinglang va savolga javob bering"),
  BILD_WORT: msg("Mos rasmni tanlang"),
  AUDIO_BILD: msg("Eshiting va mos rasmni tanlang"),
  BILD_TIPPEN: msg("Rasmda nima? Artikli bilan yozing"),
  UHR_LESEN: msg("Soat nechani ko'rsatyapti?"),
  UHR_HOEREN: msg("Eshitgan vaqtingizga mos soatni tanlang"),
  UHR_TIPPEN: msg("Soatga qarab vaqtni nemischa yozing"),
};

export function koersatma(format: FrageFormat): string {
  return MATN[format];
}

/** Format qaysi komponent bilan ko'rsatiladi (dizayn §4.1). */
export function harakat(format: FrageFormat): "TANLASH" | "YOZISH" | "YIGISH" | "RASM" | "UHR" {
  if (format === "BILD_WORT" || format === "AUDIO_BILD") return "RASM";
  // Four clock faces to pick from; `UHR_LESEN` picks German texts (TANLASH).
  if (format === "UHR_HOEREN") return "UHR";
  if (
    format === "LUECKE" ||
    format === "WORT_TIPPEN" ||
    format === "BILD_TIPPEN" ||
    format === "UHR_TIPPEN"
  ) return "YOZISH";
  if (
    format === "SATZ_BAUEN" ||
    format === "SATZ_HOEREN" ||
    format === "PAAR" ||
    format === "ZUORDNEN"
  ) return "YIGISH";
  return "TANLASH";
}
