/**
 * Breadcrumb uchun route nomlari (O'zbek tilida)
 * Key: URL segment, Value: ko'rsatiladigan nom
 */
export const routeLabels: Record<string, string> = {
  "": "Bosh sahifa",
  teachers: "O'qituvchilar",
  students: "O'quvchilar",
  leads: "Lidlar",
  outreach: "Aloqa markazi",
  "mock-exams": "Mock imtihonlar",
  form: "Forma sozlash",
  forms: "Formalar",
  new: "Yangi",
  groups: "Guruhlar",
  schedule: "Jadval",

  payments: "Moliya",
  reports: "Hisobotlar",
  "payment-reports": "To'lov hisobotlari",
  "student-payments": "O'quvchi to'lovi",
  "departed-students": "Ketgan o'quvchilar",
  graduates: "Bitiruvchilar",
  activity: "Markaz faoliyati",
  attendance: "Davomat statistikasi",
  profile: "Profil",
  settings: "Sozlamalar",
  general: "Umumiy sozlamalar",
  courses: "Kurslar",
  branches: "Filiallar",
  employees: "Xodimlar",
  rooms: "Xonalar",
  holidays: "Dam olish kunlari",
  tasks: "Topshiriqlar",
  archive: "Arxiv",
  overview: "Umumiy ma'lumotlar",
  pending: "Kutilyotgan to'lovlar",
  // /payments/debt — qarzdorlik bo'yicha yagona sahifa: qarzdorlar ro'yxati,
  // markaz qoplagani, oylik qarzdorlik va kechirilganlar. The three paths it
  // replaced only redirect now, so they never render a breadcrumb and need no
  // label — a label for a segment nobody can land on is one more thing to keep
  // true for no reader.
  debt: "Qarzdorlik",
  expenses: "Xarajatlar",
  // "Oyliklar" — the monthly payroll list (teachers + fixed-salary staff).
  // "Ish haqi" stays the term for ONE person's salary (profile tabs), so the
  // two words mark a real distinction rather than drifting vocabulary.
  salary: "Oyliklar",
  // /payments/salary/config — CEO Oylik belgilash sahifasi (xodimlar ro'yxati + bulk + individual).
  // /payments/salary/settings — CEO oylik davri sozlamalari sahifasi.
  // /profile/salary — Teacher portalida ustozning o'z oyligi sahifasi.
  config: "Oylik belgilash",
  portal: "Bosh sahifa",
  ai: "Sun'iy intellekt",
  search: "Qidiruv natijalari",
};
