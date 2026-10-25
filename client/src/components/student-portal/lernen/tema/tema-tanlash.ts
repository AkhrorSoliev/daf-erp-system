import { DEFAULT_LERNEN_TEMA, isLernenTema, lernenTemaOrDefault, type LernenTemaId } from "@/lib/lernen-temalar";

/** Device cache of the account's choice, so the first paint is already right. */
export const TEMA_KESH_KALITI = "daf.lernen.tema";

/**
 * Which look to draw. The account is the truth: `undefined` means the profile
 * has not answered yet (use the device cache), `null` means it answered "no
 * choice" (the default — never another account's cached look).
 */
export function joriyTemaId(profil: unknown, kesh: unknown): LernenTemaId {
  if (profil === undefined) return isLernenTema(kesh) ? kesh : DEFAULT_LERNEN_TEMA;
  return lernenTemaOrDefault(profil);
}
