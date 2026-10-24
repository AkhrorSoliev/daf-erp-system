import type { Dictionary } from "../translate";

/**
 * Uzbek Cyrillic overrides: Uzbek source text → the Cyrillic text, only for a
 * word the transliterator (`translit-cyrl.ts`) gets wrong. Keys are the texts
 * in `t("…")` / `msg("…")`.
 */
const uzCyrl: Dictionary = {
  // Public pages: «квитанция» (not «квитансия»), «email» stays Latin, «public» is «оммавий».
  "Tekshirilayotgan kvitansiya identifikatori noto'g'ri yoki hujjat o'chirib tashlangan bo'lishi mumkin.":
    "Текширилаётган квитанция идентификатори нотўғри ёки ҳужжат ўчириб ташланган бўлиши мумкин.",
  "DaF Sprachzentrum kvitansiyasini tekshirish": "DaF Sprachzentrum квитанциясини текшириш",
  "DaF Sprachzentrum public formasi": "DaF Sprachzentrum оммавий формаси",
  "To'g'ri email kiriting": "Тўғри email киритинг",
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
  "Kvitansiya № {code}": "Квитанция № {code}",
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
  // Student portal: loanwords with «ц» and a soft sign.
  "Hali tranzaksiya yo'q": "Ҳали транзакция йўқ",
  "Profil rasmini qanday o'zgartiraman?": "Профиль расмини қандай ўзгартираман?",
  "Profil sahifasini oching (telefonda «Ko'proq» ichida, kompyuterda yon menyuning tepasida), rasm ustiga bosing va yangi rasm tanlang.": "Профиль саҳифасини очинг (телефонда «Кўпроқ» ичида, компьютерда ён менюнинг тепасида), расм устига босинг ва янги расм танланг.",
  // Student portal radio: «станция», «плеер» and «жаз» are written so in Cyrillic Uzbek;
  // German and English genre words (schlager, oldies, indie) and «kbps» stay Latin.
  "{n} ta stansiya": "{n} та станция",
  "Germaniya va Avstriyaning jonli radiostansiyalari. Kuniga 15 daqiqa tinglash ham quloqni nemis tiliga o'rgatadi — dars qilayotganda fonda qoldiring.": "Германия ва Австриянинг жонли радиостанциялари. Кунига 15 дақиқа тинглаш ҳам қулоқни немис тилига ўргатади — дарс қилаётганда фонда қолдиринг.",
  "Yurak bosgan stansiyalaringiz": "Юрак босган станцияларингиз",
  "{name} — to'liq playerni ochish": "{name} — тўлиқ плеерни очиш",
  "Internet aloqasini tekshiring. Radiostansiya vaqtincha o'chirilgan bo'lishi ham mumkin — boshqasini tanlab ko'ring.": "Интернет алоқасини текширинг. Радиостанция вақтинча ўчирилган бўлиши ҳам мумкин — бошқасини танлаб кўринг.",
  "Oldingi stansiya": "Олдинги станция",
  "Keyingi stansiya": "Кейинги станция",
  "Boshqa stansiya tanlash": "Бошқа станция танлаш",
  "Klassika, jazz, adabiyot va uzun ko'rsatuvlar": "Классика, жаз, адабиёт ва узун кўрсатувлар",
  "Eski hitlar va schlager — sekin, tushunarli qo'shiqlar": "Эски хитлар ва schlager — секин, тушунарли қўшиқлар",
  "Mustaqil indie kanali, reklamasiz.": "Мустақил indie канали, рекламасиз.",
  "Eng yuqori sifat (256 kbps) — klassika va jazz.": "Энг юқори сифат (256 kbps) — классика ва жаз.",
  "Uzluksiz jazz, deyarli gapsiz — diqqatni buzmaydi.": "Узлуксиз жаз, деярли гапсиз — диққатни бузмайди.",
  "Nemis schlageri va eski hitlar — so'zlari sekin va aniq.": "Немис schlageri ва эски хитлар — сўзлари секин ва аниқ.",
  "Bavariyaning eng katta kanali, oldies va mintaqaviy xabarlar.": "Бавариянинг энг катта канали, oldies ва минтақавий хабарлар.",
  "Faqat nemis schlageri — qo'shiq matnini ilg'ash oson.": "Фақат немис schlageri — қўшиқ матнини илғаш осон.",
  // Loanwords from Russian: «хит» (not «ҳит») and «альтернатив» with its soft sign.
  "Pop va hitlar": "Поп ва хитлар",
  "Bavariya hitlari va ertalabki jonli suhbatlar.": "Бавария хитлари ва эрталабки жонли суҳбатлар.",
  "Hit musiqa va kun davomida yangiliklar.": "Хит мусиқа ва кун давомида янгиликлар.",
  "Frankfurt hitlari, yengil kundalik so'zlashuv.": "Франкфурт хитлари, енгил кундалик сўзлашув.",
  "60-90 yillar xalqaro hitlari.": "60-90 йиллар халқаро хитлари.",
  "Zamonaviy so'zlashuv tili va alternativ musiqa": "Замонавий сўзлашув тили ва альтернатив мусиқа",
  "Alternativ musiqa, nemis va ingliz tillari aralash.": "Альтернатив мусиқа, немис ва инглиз тиллари аралаш.",
};

export default uzCyrl;
