import { msg } from "@/i18n/msg";

/**
 * Breadcrumb uchun route nomlari (O'zbek tilida)
 * Key: URL segment, Value: ko'rsatiladigan nom
 */
export const routeLabels: Record<string, string> = {
  "": msg("Bosh sahifa"),
  teachers: msg("O'qituvchilar"),
  students: msg("O'quvchilar"),
  leads: msg("Lidlar"),
  outreach: msg("Aloqa markazi"),
  "mock-exams": msg("Mock imtihonlar"),
  form: msg("Forma sozlash"),
  forms: msg("Formalar"),
  new: msg("Yangi"),
  tahrirlash: msg("Tahrirlash"),
  groups: msg("Guruhlar"),
  schedule: msg("Jadval"),

  payments: msg("Moliya"),
  reports: msg("Hisobotlar"),
  "payment-reports": msg("Guruhlar bo'yicha to'lov"),
  "departed-students": msg("Ketgan o'quvchilar"),
  graduates: msg("Bitiruvchilar"),
  activity: msg("Markaz faoliyati"),
  attendance: msg("Davomat statistikasi"),
  marketing: msg("Marketing"),
  "dars-baholari": msg("Dars baholari"),
  "xodimlar-kpi": msg("Xodimlar KPI"),
  profile: msg("Profil"),
  settings: msg("Sozlamalar"),
  general: msg("Umumiy sozlamalar"),
  courses: msg("Kurslar"),
  // /settings/payment — "To'lov" sozlamalar bo'limi (defaultModel, sababli
  // dars krediti, hisob-kitob kuni). "payments" (ko'plik) esa /payments —
  // Moliya bo'limi, alohida kalit yuqorida.
  payment: msg("To'lov"),
  branches: msg("Filiallar"),
  employees: msg("Xodimlar"),
  rooms: msg("Xonalar"),
  holidays: msg("Dam olish kunlari"),
  reasons: msg("Sabablar"),
  daf: msg("DaF ilovasi"),
  // `/daf/oquvchilar` sahifasi allaqachon bor; yorliq shu yerda turadi, chunki
  // breadcrumb jadvali bitta fayl va uni ikki marta ochish keraksiz.
  oquvchilar: msg("O'quvchilar"),
  "absence-pause": msg("Avtomatik pauza"),
  // /settings/permissions — «Ruxsatlar», CEO only (ADR-0087).
  permissions: msg("Ruxsatlar"),
  // /settings/lead-ownership — «Lidlar egaligi», CEO only (ADR-0093).
  "lead-ownership": msg("Lidlar egaligi"),
  // /settings/kpi — «KPI sozlamalari», CEO only (ADR-0096).
  kpi: msg("KPI sozlamalari"),
  // /settings/telegram-report — «Telegram hisobot», CEO only (ADR-0095).
  "telegram-report": msg("Telegram hisobot"),
  tasks: msg("Topshiriqlar"),
  notifications: msg("Bildirishnomalar"),
  archive: msg("Arxiv"),
  overview: msg("Umumiy ma'lumotlar"),
  pending: msg("Kutilyotgan to'lovlar"),
  list: msg("To'lovlar"),
  // /payments/debt — qarzdorlik sahifasi (uch bo'lim). Uning eski tablari endi
  // alohida sahifalar: qarz tarixi va kechirilganlar. Muzlatilganlar puli
  // «Qaytariladigan pul» ga ko'chdi (/payments/frozen-balances u yerga yo'naltiradi).
  debt: msg("Qarzdorlik"),
  "debt-history": msg("Qarz tarixi"),
  "debt-write-offs": msg("Kechirilgan qarzlar"),
  // /payments/refunds — «Qaytariladigan pul» (spec B2b); /payments/refunds/history — uning tarixi.
  refunds: msg("Qaytariladigan pul"),
  history: msg("Tarix"),
  expenses: msg("Xarajatlar"),
  // "Oyliklar" — the monthly payroll list (teachers + fixed-salary staff).
  // "Ish haqi" stays the term for ONE person's salary (profile tabs), so the
  // two words mark a real distinction rather than drifting vocabulary.
  salary: msg("Oyliklar"),
  // /payments/salary/config — CEO Oylik belgilash sahifasi (xodimlar ro'yxati + bulk + individual).
  // /payments/salary/settings — CEO oylik davri sozlamalari sahifasi.
  // /profile/salary — Teacher portalida ustozning o'z oyligi sahifasi.
  config: msg("Oylik belgilash"),
  portal: msg("Bosh sahifa"),
  ai: msg("Sun'iy intellekt"),
  search: msg("Qidiruv natijalari"),
  // /media — kurs qamrovi (unit/bo'lim daraxti). /media/sections/[id] o'sha
  // daraxtdagi bitta bo'limning sahifasi; "sections" segmentiga label
  // KERAK EMAS — u "profile" kabi pass-through, `app-breadcrumb.tsx` uni
  // butunlay o'tkazib yuboradi (aks holda mavjud bo'lmagan
  // "/media/sections" ro'yxatiga havola bo'lib qolardi).
  media: msg("Media"),
  // /media/assets — eski quvurdan qolgan obrazlar/fayllar ro'yxati. Bu
  // "sections" kabi pass-through EMAS — o'zi to'liq ro'yxat sahifasi
  // (haqiqatan "/media/assets" mavjud), shuning uchun breadcrumbda ko'rinishi
  // kerak.
  assets: msg("Media fayllari"),
  qollanma: msg("Qo'llanma"),
  yangiliklar: msg("Nima yangi"),
};
