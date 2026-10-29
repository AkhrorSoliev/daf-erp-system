import type { FrageFormat } from "@/components/media/media-fragen-types";
import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";

/**
 * Format kodi → o'zbekcha nom. Ro'yxat elementlari CEOga tanish bo'lgan
 * ekran-nomlarga emas, formatning O'ZI nima qilishiga qarab yozilgan —
 * bu panel o'quvchi ko'radigan mashqni emas, dvigatelning qurish
 * qoidasini ko'rsatadi (server: `server/src/daf/uebung/uebung.service.ts` `baueKandidaten`).
 */
export const FORMAT_NOMLARI: Record<FrageFormat, string> = {
  WORT_UZ: msg("So'zdan tarjimani topish"),
  UZ_WORT: msg("Tarjimadan so'zni topish"),
  PAAR: msg("Juftlash — so'z va tarjima"),
  ARTIKEL: msg("Artikl tanlash"),
  LUECKE: msg("Gapdagi bo'shliqni to'ldirish"),
  SATZ_BAUEN: msg("So'zlardan gap qurish"),
  SATZ_HOEREN: msg("Eshitilgan gapni so'zlardan qurish"),
  SATZ_UEBERSETZEN: msg("Gap tarjimasini topish"),
  REAKTION: msg("Vaziyatga mos iborani topish"),
  ZUORDNEN: msg("Juftlash — vaziyat va ibora"),
  DIALOG_LUECKE: msg("Dialogdagi bo'shliqni to'ldirish"),
  AUDIO_WORT: msg("Eshitilgan so'zni topish"),
  WORT_TIPPEN: msg("Eshitilgan so'zni yozish"),
  HOEREN_WAHL: msg("Suhbatni eshitib savolga javob berish"),
  BILD_WORT: msg("So'zga mos rasmni topish"),
  AUDIO_BILD: msg("Eshitilgan so'zning rasmini topish"),
  BILD_TIPPEN: msg("Rasmga qarab so'zni yozish"),
  UHR_LESEN: msg("Soatdan vaqtni topish"),
  UHR_HOEREN: msg("Eshitilgan vaqtning soatini topish"),
  UHR_TIPPEN: msg("Soatga qarab vaqtni yozish"),
  LESEN_WAHL: msg("Matnni o'qib savolga javob berish"),
};

/** The optional last argument is the page's translator; a code that is not in the list shows as it is. */
export function formatNomi(
  format: string | null,
  t: (source: string, params?: Params) => string = interpolate,
): string {
  if (!format) return "—";
  const nomi = (FORMAT_NOMLARI as Record<string, string>)[format];
  return nomi ? t(nomi) : format;
}
