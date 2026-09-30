import type { Yangilik } from "./turlar";

/**
 * Foydalanuvchiga ko'rinadigan har o'zgarish shu yerga bitta yozuv qo'shadi
 * (o'sha PR'da). Eng yangisi tepada.
 */
export const yangiliklar: Yangilik[] = [
  {
    sana: "2026-09-30",
    sarlavha: "Qo'llanma ishga tushdi",
    matn: "Tizim qoidalari endi admin panel ichida. Har sahifadagi «?» tugmasi shu sahifaning qoidasini ochadi.",
    sahifa: { bolim: "boshlash", sahifa: "interfeys" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Boshqa qurilmalardan chiqish",
    matn: "Profil sahifasida «Boshqa qurilmalardan chiqish» tugmasi paydo bo'ldi. Parol o'zgarganda (Profilda, SMS orqali yoki rahbar yozib bersa) ham boshqa qurilmalardagi kirishlar tugaydi. Profilda o'zingiz o'zgartirsangiz yoki tugmani bossangiz, shu qurilmada qolasiz.",
    sahifa: { bolim: "boshlash", sahifa: "tizimga-kirish" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Telefon raqam joriy parol bilan o'zgaradi",
    matn: "Profilda telefon raqamni o'zgartirganda «Joriy parol» so'raladi. Eski raqam kirish uchun ishlamay qoladi: keyingi safar yangi raqam bilan kirasiz.",
    sahifa: { bolim: "boshlash", sahifa: "tizimga-kirish" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Rol berish va xodim hisobini o'zgartirish qoidalari",
    matn: "Rolni faqat o'zingizdan pastdagilarga bera olasiz. Xodim hisobini faqat undan yuqori rahbar o'zgartiradi: direktor boshqa direktorning hisobini o'zgartira olmaydi, administrator esa hech kimning hisobini o'zgartira olmaydi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "boshlash", sahifa: "rollar-va-huquqlar" },
  },
  {
    sana: "2026-09-24",
    sarlavha: "Bloklangan xodim darhol to'xtaydi",
    matn: "«To'xtatilgan» yoki «Ishdan bo'shatilgan» qilingan, yoki arxivlangan xodim keyingi harakatidayoq to'xtaydi va «Hisobingiz bloklangan» xabarini ko'radi. Ilgari u bir soatgacha ishlashda davom etardi.",
    rollar: [1, 2],
    sahifa: { bolim: "boshlash", sahifa: "rollar-va-huquqlar" },
  },
  {
    sana: "2026-09-19",
    sarlavha: "Bir odam ikki rolda — alohida hisob",
    matn: "O'quvchi hisobi xodim hisobi ochilishiga endi to'sqinlik qilmaydi: bir odam o'quvchi ham, xodim ham bo'lsa, unda ikkita alohida hisob va ikkita parol bo'ladi. Bitta telefonga bitta ishlab turgan xodim hisobi to'g'ri keladi.",
    rollar: [1, 2],
    sahifa: { bolim: "boshlash", sahifa: "tizimga-kirish" },
  },
  {
    sana: "2026-09-10",
    sarlavha: "Faol o'quvchilar soni hamma joyda bir xil",
    matn: "Bosh sahifa, «O'quvchilar» sahifasi va Telegram hisobotida «faol o'quvchi» endi bir xil qoida bilan sanaladi: holati «Faol» va hozir faol guruhda o'qiydi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "boshlash", sahifa: "lugat" },
  },
];
