import { msg } from "@/i18n/msg";

/**
 * The staff portals' design skins (ADR-0101): a colour set plus a font. The
 * ids mirror `server/src/common/ui-skins.ts` (ui-skins.test.ts compares them);
 * the colours and fonts themselves live in `app/skins.css` and `app/layout.tsx`.
 * `swatch` is only the dot drawn in the menu. The labels are names and stay as
 * written; each `hint` is a text the menu draws through `t(hint)`.
 */
export const UI_SKINS = [
  { id: "daftar", label: "Daftar", hint: msg("To'q ko'k, texnik shrift"), swatch: "#1b2d4e" },
  { id: "ormon", label: "O'rmon", hint: msg("Chuqur yashil, yumaloq shakllar"), swatch: "#1f4d3a" },
  { id: "gilos", label: "Gilos", hint: msg("To'q bordo, keng harflar"), swatch: "#6b2233" },
  { id: "grafit", label: "Grafit", hint: msg("Kulrang, tor shrift"), swatch: "#2f3640" },
  { id: "qum", label: "Qum", hint: msg("Iliq jigarrang"), swatch: "#6b4a1e" },
] as const;

export type UiSkinId = (typeof UI_SKINS)[number]["id"];

export const UI_SKIN_IDS: readonly UiSkinId[] = UI_SKINS.map((s) => s.id);

export const DEFAULT_SKIN: UiSkinId = "daftar";

export function isUiSkin(value: unknown): value is UiSkinId {
  return typeof value === "string" && (UI_SKIN_IDS as readonly string[]).includes(value);
}

export function skinOrDefault(value: unknown): UiSkinId {
  return isUiSkin(value) ? value : DEFAULT_SKIN;
}

/** The `data-skin` value to put on the page: none for the default, whose tokens are the base ones. */
export function skinAttribute(value: unknown): UiSkinId | null {
  const skin = skinOrDefault(value);
  return skin === DEFAULT_SKIN ? null : skin;
}
