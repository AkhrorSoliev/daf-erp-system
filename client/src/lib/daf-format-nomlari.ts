import type { FrageFormat } from "@/components/media/media-fragen-types";

/**
 * Format kodi → o'zbekcha nom. Ro'yxat elementlari CEOga tanish bo'lgan
 * ekran-nomlarga emas, formatning O'ZI nima qilishiga qarab yozilgan —
 * bu panel o'quvchi ko'radigan mashqni emas, dvigatelning qurish
 * qoidasini ko'rsatadi (server: `VORSCHAU_BAUER`).
 */
export const FORMAT_NOMLARI: Record<FrageFormat, string> = {
  WORT_UZ: "So'zdan tarjimani topish",
  UZ_WORT: "Tarjimadan so'zni topish",
  PAAR: "Juftlash — so'z va tarjima",
  ARTIKEL: "Artikl tanlash",
  LUECKE: "Gapdagi bo'shliqni to'ldirish",
  SATZ_BAUEN: "So'zlardan gap qurish",
  SATZ_UEBERSETZEN: "Gap tarjimasini topish",
  REAKTION: "Vaziyatga mos iborani topish",
  ZUORDNEN: "Juftlash — vaziyat va ibora",
  DIALOG_LUECKE: "Dialogdagi bo'shliqni to'ldirish",
  AUDIO_WORT: "Eshitilgan so'zni topish",
  WORT_TIPPEN: "Eshitilgan so'zni yozish",
  HOEREN_WAHL: "Suhbatni eshitib savolga javob berish",
};

export function formatNomi(format: string | null): string {
  if (!format) return "—";
  return (FORMAT_NOMLARI as Record<string, string>)[format] ?? format;
}
