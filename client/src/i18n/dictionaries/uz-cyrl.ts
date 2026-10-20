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
  "Ctrl+Enter — yuborish": "Ctrl+Enter — юбориш",
  // File sizes: «B» stays Latin like «KB» and «MB» next to it.
  "{n} B": "{n} B",
  // The names are sorted in Latin order: the letters stay Latin.
  "Ism (A–Z)": "Исм (A–Z)",
  // Month names: Cyrillic Uzbek writes «я» here, which the rules cannot know.
  "Sentabr": "Сентябр",
  "Oktabr": "Октябр",
  "sentabrda": "сентябрда",
  "oktabrda": "октябрда",
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
  // Bot commands and button names are typed in Latin: they stay as the bot shows them.
  "botda /xodim kerak": "ботда /xodim керак",
  "Hisobot dushanba–shanba belgilangan vaqtda keladi; yakshanba va butun markaz bayramida avtomatik bormaydi. Oluvchi botdagi «📊 Hisobot» tugmasi bilan istalgan payt so'ray oladi.": "Ҳисобот душанба–шанба белгиланган вақтда келади; якшанба ва бутун марказ байрамида автоматик бормайди. Олувчи ботдаги «📊 Hisobot» тугмаси билан исталган пайт сўрай олади.",
  // A German exam section name: course content, never transliterated.
  "Masalan: Hören": "Масалан: Hören",
  // A Telegram username is searched as typed: the word stays Latin.
  "Ism, telefon, username...": "Исм, телефон, username...",
  // «t» + «s» across a suffix boundary: the rules would read it as «ц».
  "Narx kiritilmadi. Agar shunday davom etsangiz, imtihon bepul bo'lib yaratiladi va bot ro'yxatdan o'tganlardan to'lov so'ramaydi.": "Нарх киритилмади. Агар шундай давом этсангиз, имтиҳон бепул бўлиб яратилади ва бот рўйхатдан ўтганлардан тўлов сўрамайди.",
  "Bu ishtirokchi {amount} so'm to'lagan. O'chirilsa, bu to'lov mock daromadidan chiqadi, qayta ro'yxatdan o'tsa undan yana to'lov so'raladi. Avval pulni odamga qaytaring.": "Бу иштирокчи {amount} сўм тўлаган. Ўчирилса, бу тўлов mock даромадидан чиқади, қайта рўйхатдан ўтса ундан яна тўлов сўралади. Аввал пулни одамга қайтаринг.",
};

export default uzCyrl;
