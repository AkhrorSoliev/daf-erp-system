import { format, parseISO } from "date-fns";

/**
 * "Aylangan sana" ustuni — ya'ni odam qaysi kuni o'quvchi bo'ldi.
 *
 * `statusChangedAt` bu savolga faqat lid HAQIQATDAN aylangan bo'lsa javob
 * beradi: o'sha ustun lid YO'QOTILGAN deb belgilanganda ham yoziladi, va
 * `LeadsArchiveService.restore` bosqichni `NEW` ga qaytarganda uni tozalamaydi.
 * Shartsiz chiqarilsa tiklangan lid "hisobdan chiqarilgan kuni o'quvchi bo'ldi"
 * degan yolg'onni ko'rsatardi.
 */
export function aylanganSana(lead: {
  statusEnum: string;
  statusChangedAt: string | null;
}): string | null {
  if (lead.statusEnum !== "CONVERTED" || !lead.statusChangedAt) return null;
  return format(parseISO(lead.statusChangedAt), "dd.MM.yyyy");
}
