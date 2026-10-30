import type { FrageFormat, KalitliFrage, VorschauFrage } from "./media-fragen-types";
import { formatlarBoyichaGuruhla } from "./media-fragen-utils";
import type { PleyerElement } from "./media-pleyer";

export function kalitla(fragen: VorschauFrage[]): KalitliFrage[] {
  return fragen.map((f, i) => ({ ...f, kalit: `f${i}` }));
}

export interface SeansGuruhi {
  format: FrageFormat;
  fragen: KalitliFrage[];
  /** Shu seans turida oldinroq chiqadi. */
  afzal: boolean;
}

export function seansGuruhlari(fragen: KalitliFrage[], bevorzugt: FrageFormat[]): SeansGuruhi[] {
  const guruhlar = formatlarBoyichaGuruhla(fragen);
  const afzallar = bevorzugt.filter((format) => guruhlar.has(format));
  const qolgan = [...guruhlar.keys()].filter((format) => !bevorzugt.includes(format));
  return [
    ...afzallar.map((format) => ({ format, fragen: guruhlar.get(format)!, afzal: true })),
    ...qolgan.map((format) => ({ format, fragen: guruhlar.get(format)!, afzal: false })),
  ];
}

export function seansNavbati(guruhlar: SeansGuruhi[]): PleyerElement[] {
  return guruhlar.flatMap((g) =>
    g.fragen.flatMap((f) => (f.audioUrl ? [{ id: f.kalit, url: f.audioUrl, nom: f.prompt || f.titel || "" }] : [])),
  );
}
