import type { QollanmaSahifa } from "./turlar";

/** Aniq yo'l yoki "/asos/*" — asosdan keyin kamida bitta segment. */
export function yolMosmi(naqsh: string, pathname: string): boolean {
  const yol = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (naqsh.endsWith("/*")) {
    const asos = naqsh.slice(0, -2);
    return yol.startsWith(`${asos}/`) && yol.length > asos.length + 1;
  }
  return yol === naqsh;
}

export function sahifalarYolUchun(royxat: readonly QollanmaSahifa[], pathname: string): QollanmaSahifa[] {
  return royxat.filter((s) => s.yollar.some((naqsh) => yolMosmi(naqsh, pathname)));
}
