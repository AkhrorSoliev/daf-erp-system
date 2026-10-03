import { kunQosh } from "./sana";
import type { Yangilik } from "./turlar";

/** Birinchi kirishda (qiymat yo'q) shuncha kunlik yozuv sanaladi. */
export const BIRINCHI_KIRISH_KUNLARI = 14;

export function yangiliklarRolUchun(royxat: readonly Yangilik[], rollar: readonly number[]): Yangilik[] {
  return royxat.filter((y) => !y.rollar || y.rollar.some((r) => rollar.includes(r)));
}

export function oqilmaganSoni(royxat: readonly Yangilik[], oxirgiKorilgan: string | null, bugun: string): number {
  const chegara = oxirgiKorilgan ?? kunQosh(bugun, -BIRINCHI_KIRISH_KUNLARI);
  return royxat.filter((y) => y.sana > chegara).length;
}

export function engYangiSana(royxat: readonly Yangilik[]): string | null {
  return royxat.reduce<string | null>((eng, y) => (eng === null || y.sana > eng ? y.sana : eng), null);
}
