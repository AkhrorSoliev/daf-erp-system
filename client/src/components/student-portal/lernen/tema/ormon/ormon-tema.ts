import type { LernenTema } from "../tema-turlari";
import { OrmonJoy } from "./ormon-joy";
import { OrmonMukofotFoni } from "./ormon-mukofot-foni";
import { OrmonSahna } from "./ormon-sahna";
import { OrmonTugun } from "./ormon-tugun";
import { OrmonUnitLavha } from "./ormon-unit-lavha";

/** «O'rmon» (spec §8, ADR-0131): a soft layered forest in three biomes. */
export const ormonTema: LernenTema = {
  id: "ormon",
  TugunBelgisi: OrmonTugun,
  MukofotFoni: OrmonMukofotFoni,
  UnitLavha: OrmonUnitLavha,
  UnitJoyi: OrmonJoy,
  Sahna: OrmonSahna,
};
