import type { TugunHolat, TugunTone } from "../tema-turlari";

/** Face = the top of the chunky button, lip = its darker edge underneath. */
const TONA: Record<TugunTone, string> = {
  coral: "var(--coral-500)",
  amber: "var(--amber-500)",
  teal: "var(--teal-500)",
  sky: "var(--sky-500)",
  grape: "var(--grape-500)",
};

const lab = (yuz: string) => `color-mix(in srgb, ${yuz} 72%, black)`;

/** The path's level colours (CEO-approved): A1 coral, A2 teal, B1 grape. */
export const DARAJA_TONI: Record<string, TugunTone> = { A1: "coral", A2: "teal", B1: "grape" };

export function tugunRangi(holat: TugunHolat, tone: TugunTone): { yuz: string; lab: string } {
  if (holat === "locked") return { yuz: "var(--bg-sunk)", lab: "var(--line)" };
  const yuz = holat === "done" ? "var(--amber-500)" : TONA[tone];
  return { yuz, lab: lab(yuz) };
}

export function belgiTuri(holat: TugunHolat): "tekshirildi" | "yulduz" | "qulf" {
  return holat === "done" ? "tekshirildi" : holat === "active" ? "yulduz" : "qulf";
}
