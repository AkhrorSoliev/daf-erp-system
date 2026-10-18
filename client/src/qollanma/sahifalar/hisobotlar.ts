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
    sahifa: "markaz-faoliyati",
    sarlavha: "Markaz faoliyati",
    qisqacha:
      "Markaz xonalari va o'rinlarining qanchasi ishlatilayotgani, qachon xona bo'sh bo'lishi va qaysi guruhda bo'sh o'rin borligi — tanlangan oy uchun, o'tgan oylarda keyin yopilgan guruhlar bilan.",
    rollar: [1, 2],
    adr: ["0099"],
    yollar: ["/reports/activity"],
    kalitSozlar: ["markaz faoliyati", "xona bandligi", "bo'sh xona", "bo'sh o'rin", "guruh to'lganligi", "sig'im", "yangi guruh", "excel"],
    yangilangan: "2026-10-17",
  },
  {
    bolim: "hisobotlar",
    sahifa: "davomat-hisoboti",
    sarlavha: "Davomat hisoboti",
    qisqacha:
      "O'quvchilar darsga kelyaptimi, qayerda kelmayapti va sababli darslar to'lovga qanday ta'sir qiladi — hamma blok bitta yozuvlar to'plamidan, bosh sahifadagi davomat ham shu raqam.",
    rollar: [1, 2],
    adr: ["0103", "0054"],
    yollar: ["/reports/attendance"],
    kalitSozlar: ["davomat", "davomat foizi", "kelmadi", "sababli", "ko'p qoldiruvchi", "past davomat", "ketma-ket kelmayotganlar", "excel"],
    yangilangan: "2026-10-17",
  },
  {
    bolim: "hisobotlar",
    sahifa: "auditoriya",
    sarlavha: "Auditoriya",
    qisqacha:
      "Hozir o'qiyotgan o'quvchilar kim: jinsi, yoshi, kurs va filial kesimida — va bu raqamlar qanchalik to'liq ma'lumotga tayanishi.",
    rollar: [1, 2],
    adr: ["0108", "0039"],
    yollar: ["/reports/audience"],
    kalitSozlar: ["auditoriya", "jins", "yosh", "erkak", "ayol", "o'rtacha yosh", "yosh guruhlari", "kim o'qiydi"],
    yangilangan: "2026-10-17",
  },
  {
    bolim: "hisobotlar",
    sahifa: "bot-hisoboti",
    sarlavha: "Bot hisoboti",
    qisqacha:
      "Botning kanalga a'zolik talabi nechta odamni kanalga olib kelgani — tanlangan oyda bot to'xtatgan odamlar, ulardan nechtasi a'zo bo'lgani va keyin chiqib ketgani; foiz 100% dan oshmaydi.",
    rollar: [1, 2],
    adr: ["0105"],
    yollar: ["/reports/bot"],
    kalitSozlar: ["bot", "bot hisoboti", "kanal", "kanalga a'zo bo'ldi", "bot to'xtatdi", "kutilmoqda", "telegram kanal"],
    yangilangan: "2026-10-17",
  },
  {
    bolim: "hisobotlar",
    sahifa: "ketgan-oquvchilar",
    sarlavha: "Ketgan o'quvchilar hisoboti",
    qisqacha:
      "Kim, qachon, nega va qayerdan ketdi. Hamma raqam bitta ro'yxatdan hisoblanadi: sabablar va ro'yxatdagi ketganlar soni tepadagi «ketdi» ga teng, davr oyining ustuni ham; kurs va ustoz filtri hamma blokka ta'sir qiladi.",
    rollar: [1, 2],
    adr: ["0098", "0035"],
    yollar: ["/reports/departed-students"],
    kalitSozlar: ["ketgan", "ketgan o'quvchilar", "ketish sababi", "kutilmoqda", "qaytgan", "oy boshida", "ulushi", "ustoz bo'yicha", "excel"],
    yangilangan: "2026-10-17",
  },
  {
    bolim: "hisobotlar",
    sahifa: "dars-baholari",
    sarlavha: "Dars baholari",
    qisqacha:
      "O'quvchi darsdan keyin Telegram botda darsga 1 dan 5 gacha baho qo'yadi, past bahoda sababini yozadi. CEO ustozlarning o'rtacha bahosi, javob ulushi va past baholarni shu sahifada ko'radi.",
    rollar: [1],
    adr: ["0091", "0111"],
    yollar: ["/reports/dars-baholari"],
    kalitSozlar: ["baho", "dars bahosi", "yulduz", "o'quvchi fikri", "ustoz sifati", "past baho", "izoh"],
    yangilangan: "2026-10-18",
  },
  {
    bolim: "hisobotlar",
    sahifa: "xodimlar-kpi",
    sarlavha: "Xodimlar KPI",
    qisqacha:
      "Administrator egasi bo'lgan lid birinchi to'lovni qilganda va u yozgan to'lov va'dasi bajarilganda natija yoziladi. CEO va filial direktori kim qancha natija qilganini, o'sish va kamayishni shu sahifada ko'radi. Hozir kuzatuv: pul berilmaydi.",
    rollar: [1, 2],
    adr: ["0096", "0093"],
    yollar: ["/reports/xodimlar-kpi", "/settings/leads-kpi"],
    kalitSozlar: ["KPI", "xodim natijasi", "administrator", "lid to'lov qildi", "va'da bajarildi", "mukofot", "kuzatuv"],
    yangilangan: "2026-10-18",
  },
  {
    bolim: "hisobotlar",
    sahifa: "telegram-hisobot",
    sarlavha: "Telegram hisobot",
    qisqacha:
      "Kunlik hisobot CEO tanlagan xodimlarning shaxsiy Telegram chatiga, har biriga o'z vaqti, filiallari, bo'limlari va ko'rinishi bilan boradi.",
    rollar: [1],
    adr: ["0095", "0097"],
    yollar: ["/settings/telegram"],
    kalitSozlar: ["telegram", "kunlik hisobot", "shaxsiy hisobot", "bot", "hisobot vaqti", "filial", "jadval"],
    yangilangan: "2026-10-18",
  },
];
