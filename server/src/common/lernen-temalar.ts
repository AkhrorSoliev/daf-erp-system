/**
 * The Ta'lim looks a student may pick (ADR-0125). `Student.lernenTema` holds
 * one of these ids; null means the default. `client/src/lib/lernen-temalar.ts`
 * mirrors this list and its test compares the two. These are NOT the staff
 * skins of ADR-0101 (`User.uiSkin`): the ids may look alike ("ormon"), the
 * lists and columns are separate.
 */
export const LERNEN_TEMA_IDLARI = ['toza', 'ormon', 'dengiz', 'alp'] as const;

export type LernenTemaId = (typeof LERNEN_TEMA_IDLARI)[number];

export const DEFAULT_LERNEN_TEMA: LernenTemaId = 'toza';
