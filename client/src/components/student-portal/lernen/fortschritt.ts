import type { LernenSeans } from "./types";

export type SeansHolatBelgisi = "BAJARILGAN" | "NAVBATDAGI" | "QULF";

/**
 * Qulf MIJOZDA hisoblanadi, serverda emas.
 *
 * Sabab: bu ko'rsatish qoidasi, xavfsizlik chegarasi emas. Server
 * allaqachon istalgan darsning savollarini beradi (dvigatel izohidagi
 * D7 ochiqligi) va bundan hech kim yutmaydi — o'quvchi faqat o'z
 * statistikasiga ta'sir qiladi. Qulfning maqsadi boshqa: material
 * progressiv, tartibni buzib kirgan o'quvchiga mashq «qiyin» emas,
 * «tushunarsiz» bo'ladi.
 */
export function seansHolatlari(lessons: LernenSeans[]): SeansHolatBelgisi[] {
  const birinchiOchiq = lessons.findIndex((l) => l.completedAt == null);
  return lessons.map((l, i) => {
    if (l.completedAt != null) return "BAJARILGAN";
    if (i === birinchiOchiq) return "NAVBATDAGI";
    return "QULF";
  });
}
