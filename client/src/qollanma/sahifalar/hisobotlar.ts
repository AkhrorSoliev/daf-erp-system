import type { QollanmaSahifa } from "../turlar";

export const hisobotlar: QollanmaSahifa[] = [
  {
    bolim: "hisobotlar",
    sahifa: "guruhlar-tolovi",
    sarlavha: "Guruhlar bo'yicha to'lov",
    qisqacha:
      "Tanlangan oyda qaysi guruh qancha to'lagani, qancha qolgani va kim to'lamagani — «Umumiy ma'lumotlar»dagi raqamlarning o'zi, guruh, ustoz va kurs kesimida.",
    rollar: [1, 2, 3],
    adr: ["0092", "0058"],
    yollar: ["/reports/payment-reports"],
    kalitSozlar: ["guruh to'lovi", "qarzdor guruh", "ustoz bo'yicha to'lov", "to'lov hisoboti", "qoldi", "excel"],
    yangilangan: "2026-10-16",
  },
  {
    bolim: "hisobotlar",
    sahifa: "dars-baholari",
    sarlavha: "Dars baholari",
    qisqacha:
      "O'quvchi darsdan keyin Telegram botda darsga 1 dan 5 gacha baho qo'yadi, past bahoda sababini yozadi. CEO ustozlarning o'rtacha bahosi, javob ulushi va past baholarni shu sahifada ko'radi.",
    rollar: [1],
    adr: ["0091"],
    yollar: ["/reports/dars-baholari"],
    kalitSozlar: ["baho", "dars bahosi", "yulduz", "o'quvchi fikri", "ustoz sifati", "past baho", "izoh"],
    yangilangan: "2026-10-16",
  },
  {
    bolim: "hisobotlar",
    sahifa: "xodimlar-kpi",
    sarlavha: "Xodimlar KPI",
    qisqacha:
      "Administrator egasi bo'lgan lid birinchi to'lovni qilganda va u yozgan to'lov va'dasi bajarilganda natija yoziladi. CEO va filial direktori kim qancha natija qilganini, o'sish va kamayishni shu sahifada ko'radi. Hozir kuzatuv: pul berilmaydi.",
    rollar: [1, 2],
    adr: ["0096", "0093"],
    yollar: ["/reports/xodimlar-kpi", "/settings/kpi"],
    kalitSozlar: ["KPI", "xodim natijasi", "administrator", "lid to'lov qildi", "va'da bajarildi", "mukofot", "kuzatuv"],
    yangilangan: "2026-10-17",
  },
  {
    bolim: "hisobotlar",
    sahifa: "telegram-hisobot",
    sarlavha: "Telegram hisobot",
    qisqacha:
      "Kunlik hisobot CEO tanlagan xodimlarning shaxsiy Telegram chatiga, har biriga o'z vaqti, filiallari, bo'limlari va ko'rinishi bilan boradi.",
    rollar: [1],
    adr: ["0095", "0097"],
    yollar: ["/settings/telegram-report"],
    kalitSozlar: ["telegram", "kunlik hisobot", "shaxsiy hisobot", "bot", "hisobot vaqti", "filial", "jadval"],
    yangilangan: "2026-10-16",
  },
];
