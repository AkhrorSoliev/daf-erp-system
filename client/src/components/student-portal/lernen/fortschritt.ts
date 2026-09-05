import type { LernenSeans, LernenUnitSummary } from "./types";

export type SeansHolatBelgisi = "BAJARILGAN" | "NAVBATDAGI" | "QULF";
export type UnitHolatBelgisi = "BAJARILGAN" | "OCHIQ" | "QULF" | "TAYYOR_EMAS";

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

/**
 * Unit ochiladi, agar oldingisi TO'LIQ tugallangan bo'lsa; birinchisi
 * har doim ochiq.
 *
 * Kontenti yo'q unit (`lessonCount === 0`) qulf bo'lib ko'rinadi va
 * tagida «tez orada» yoziladi: bo'sh unitni ochiq ko'rsatish «buzuq»
 * degan taassurot berardi.
 */
export function unitHolati(units: LernenUnitSummary[]): UnitHolatBelgisi[] {
  const out: UnitHolatBelgisi[] = [];
  let oldingiTugagan = true;

  for (const u of units) {
    if (u.lessonCount === 0) {
      out.push("TAYYOR_EMAS");
      oldingiTugagan = false;
      continue;
    }
    const tugagan = u.doneCount >= u.lessonCount;
    if (tugagan) out.push("BAJARILGAN");
    else if (oldingiTugagan) out.push("OCHIQ");
    else out.push("QULF");
    oldingiTugagan = tugagan;
  }

  return out;
}
