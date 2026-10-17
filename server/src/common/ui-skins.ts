/**
 * The staff portals' design skins (ADR-0097): a colour set plus a font, chosen
 * per account. `User.uiSkin` holds one of these ids; null means the default.
 * `client/src/lib/ui-skins.ts` mirrors this list and its test compares the two.
 */
export const UI_SKIN_IDS = [
  'daftar',
  'ormon',
  'gilos',
  'grafit',
  'qum',
] as const;

export type UiSkinId = (typeof UI_SKIN_IDS)[number];

export const DEFAULT_UI_SKIN: UiSkinId = 'daftar';
