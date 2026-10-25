import type { LernenTema } from "../tema-turlari";
import { TozaMukofotFoni } from "./toza-mukofot-foni";
import { TozaTugun } from "./toza-tugun";
import { TozaUnitLavha } from "./toza-unit-lavha";

export const tozaTema: LernenTema = {
  id: "toza",
  TugunBelgisi: TozaTugun,
  MukofotFoni: TozaMukofotFoni,
  UnitLavha: TozaUnitLavha,
};
