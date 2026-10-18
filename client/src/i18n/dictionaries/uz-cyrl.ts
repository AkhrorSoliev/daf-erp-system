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
  "Baholar ANONIM: o'quvchining ismi hech qayerda ko'rsatilmaydi.": "Баҳолар АНОНИМ: ўқувчининг исми ҳеч қаерда кўрсатилмайди.",
  // Key names stay as printed on the keyboard.
  "Esc — bekor, Ctrl+Enter — saqlash": "Esc — бекор, Ctrl+Enter — сақлаш",
  // The names are sorted in Latin order: the letters stay Latin.
  "Ism (A–Z)": "Исм (A–Z)",
  // Month names: Cyrillic Uzbek writes «я» here, which the rules cannot know.
  "Sentabr": "Сентябр",
  "Oktabr": "Октябр",
  "Iyn": "Июн",
  "Iyl": "Июл",
  "Noy": "Ноя",
  // Loanwords: Cyrillic Uzbek writes «ц» here, which the rules (s → с) cannot know.
  "Kvitansiya": "Квитанция",
  "Ism, telefon, ID yoki kvitansiya raqami": "Исм, телефон, ID ёки квитанция рақами",
  "Kassa qoldig'idan shu summa ayiriladi va kvitansiya chiqadi. Sana — bugun.": "Касса қолдиғидан шу сумма айирилади ва квитанция чиқади. Сана — бугун.",
  "Tranzaksiya raqami ({provider} tizimida)": "Транзакция рақами ({provider} тизимида)",
  "Tranzaksiyani biriktirish": "Транзакцияни бириктириш",
  "Tranzaksiya raqami (externalId)": "Транзакция рақами (externalId)",
  // A technical term in a hyphenated pair: the rules would convert each half.
  "Bu {n} ta xodim uchun mavjud **umumiy** qoidani bekor qiladi (per-group qoidalar tegmaydi).": "Бу {n} та ходим учун мавжуд **умумий** қоидани бекор қилади (per-group қоидалар тегмайди).",
};

export default uzCyrl;
