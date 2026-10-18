import type { Dictionary } from "../translate";

/**
 * Uzbek Cyrillic overrides: Uzbek source text → the Cyrillic text, only for a
 * word the transliterator (`translit-cyrl.ts`) gets wrong. Keys are the texts
 * in `t("…")` / `msg("…")`.
 */
const uzCyrl: Dictionary = {
  // The rules give «Профил»; this loanword keeps its soft sign.
  "Profil": "Профиль",
  // An all-caps word reads as an acronym and stays Latin; this one is Uzbek.
  "JAMI": "ЖАМИ",
  // Key names stay as printed on the keyboard.
  "Esc — bekor, Ctrl+Enter — saqlash": "Esc — бекор, Ctrl+Enter — сақлаш",
};

export default uzCyrl;
