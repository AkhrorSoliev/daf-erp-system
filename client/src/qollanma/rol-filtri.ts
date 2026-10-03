import type { QollanmaBolim, QollanmaSahifa, RolId } from "./turlar";

export const ROL_NOMLARI: Record<RolId, string> = {
  1: "CEO",
  2: "Filial direktori",
  3: "Administrator",
  4: "O'qituvchi",
  5: "Kassir",
};

/** Bir nechta roli bor xodim — hammasining yig'indisini ko'radi. */
export function sahifalarRolUchun(
  royxat: readonly QollanmaSahifa[],
  rollar: readonly number[],
): QollanmaSahifa[] {
  return royxat.filter((s) => s.rollar.some((r) => rollar.includes(r)));
}

export interface BolimGuruhi {
  bolim: QollanmaBolim;
  sahifalar: QollanmaSahifa[];
}

/** Bo'sh qolgan bo'lim ko'rsatilmaydi. */
export function bolimlarRolUchun(
  bolimRoyxati: readonly QollanmaBolim[],
  sahifaRoyxati: readonly QollanmaSahifa[],
  rollar: readonly number[],
): BolimGuruhi[] {
  const korinadigan = sahifalarRolUchun(sahifaRoyxati, rollar);
  return bolimRoyxati
    .map((bolim) => ({
      bolim,
      sahifalar: korinadigan.filter((s) => s.bolim === bolim.id),
    }))
    .filter((g) => g.sahifalar.length > 0);
}
