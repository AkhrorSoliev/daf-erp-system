import { DEFAULT_LERNEN_TEMA, type LernenTemaId } from "@/lib/lernen-temalar";
import type { LernenTema } from "./tema-turlari";
import { dengizTema } from "./dengiz/dengiz-tema";
import { ormonTema } from "./ormon/ormon-tema";
import { tozaTema } from "./toza/toza-tema";

/** Finished themes only; a look the student picked but that is not built draws the default. */
export const TEMALAR: Partial<Record<LernenTemaId, LernenTema>> = {
  toza: tozaTema,
  ormon: ormonTema,
  dengiz: dengizTema,
};

export function temaTop(id: LernenTemaId): LernenTema {
  return TEMALAR[id] ?? (TEMALAR[DEFAULT_LERNEN_TEMA] as LernenTema);
}
