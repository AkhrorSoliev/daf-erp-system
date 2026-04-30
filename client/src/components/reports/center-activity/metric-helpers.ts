export type CenterActivityBucket = "daily" | "weekly" | "monthly";

export interface CenterActivityKpis {
  utilizationPct: number;
  emptyHours: number;
  activeStudents: number;
  potentialExtraRevenue: number;
  emptySeats: number;
  extraStudentsCapacity: number;
}

export interface CenterActivityRoomGroup {
  id: string;
  name: string;
  enrolled: number;
  lessonHoursPerWeek: number;
  coursePrice: number;
  groupTotalRevenue: number;
}

export interface CenterActivityRoomTotals {
  groupCount: number;
  enrolled: number;
  emptySeats: number;
  extraStudentsCapacity: number;
  lessonHoursPerWeek: number;
  idleHoursPerWeek: number;
  idleHoursPeriod: number;
  coursePriceSum: number;
  revenueSum: number;
  potentialExtraRevenue: number;
  seatHoursCapacityScheduled: number | null;
  seatHoursActual: number;
  seatHoursPlanned: number | null;
  seatHoursActualPeriod: number;
  seatHoursPlannedPeriod: number | null;
  fikPct: number | null;
}

export interface CenterActivityRoom {
  id: string;
  name: string;
  branchId: number;
  branchName: string;
  capacity: number | null;
  workingHoursPerWeek: number;
  groups: CenterActivityRoomGroup[];
  totals: CenterActivityRoomTotals;
}

export interface PotentialBreakdownRoom {
  roomId: string;
  roomName: string;
  branchName: string;
  capacity: number | null;
  enrolled: number;
  currentIncome: number;
  maxIncome: number;
  gap: number;
  fillPct: number | null;
}

export interface PotentialBreakdown {
  currentIncome: number;
  maxIncome: number;
  gap: number;
  utilizationPct: number;
  growthPct: number;
  rooms: PotentialBreakdownRoom[];
}

export interface CenterActivityTrendPoint {
  bucketStart: string;
  label: string;
  utilizationPct: number;
  emptyHours: number;
  activeStudents: number;
  emptySeats: number;
  extraStudentsCapacity: number;
}

export interface CenterActivityResponse {
  range: {
    startDate: string;
    endDate: string;
    days: number;
    weeks: number;
    bucketUsed: CenterActivityBucket;
  };
  kpis: CenterActivityKpis;
  potentialBreakdown: PotentialBreakdown;
  rooms: CenterActivityRoom[];
  trend: CenterActivityTrendPoint[];
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  return `${hours.toLocaleString("uz-UZ", { maximumFractionDigits: 1 })} soat`;
}

export function formatPctValue(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return `${pct.toLocaleString("uz-UZ", { maximumFractionDigits: 1 })}%`;
}

export function formatCount(count: number, suffix = "ta"): string {
  return `${count.toLocaleString("uz-UZ")} ${suffix}`;
}

export function getFikColor(pct: number | null): string | undefined {
  if (pct === null) return undefined;
  if (pct >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function getUtilizationColor(pct: number): string | undefined {
  if (pct >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export const KPI_TOOLTIPS = {
  utilization:
    "Xonalarning ish vaqti necha foiz darslar bilan band ekanligini ko'rsatadi.\n\nHisob: jami dars soatlari ÷ jami ish soatlari × 100.\n\nYuqori foiz — markaz vaqti yaxshi ishlatilgan. Past foiz — bo'sh vaqtlar ko'p, yangi guruhlar joylashtirish imkoniyati bor.\n\nDIQQAT: bu \"foyda\" emas, vaqt bandligi. Daromad statistikasi alohida \"Potensial qo'shimcha daromad\" KPI'sida.",
  emptyHours:
    "Xonalarning bo'sh qolgan ish vaqti soatlari. Hisob: jami ish soatlari − jami dars soatlari. Kam bo'sh vaqt yaxshi foydalanishni bildiradi.",
  activeStudents:
    "Hozirda ta'lim olayotgan o'quvchilar soni. Bir o'quvchi bir nechta guruhda bo'lsa ham bir marta sanaladi.",
  potentialRevenue:
    "Agar markaz to'liq sig'imda ishlasa, qancha qo'shimcha daromad olinadi. Hisob: har bir guruh uchun (sig'im − o'quvchilar) × kurs narxi.",
  emptySeats:
    "Jismoniy bo'sh o'rindiqlar soni. Hisob: har xona uchun sig'im − eng ko'p o'quvchili guruh. Bu — bir vaqtning o'zida bo'sh qoladigan o'rindiqlar.",
  extraStudents:
    "Hozirgi guruhlardagi jami bo'sh enrollment slotlari. Hisob: har guruh uchun (sig'im − o'quvchilar), barcha guruhlar bo'yicha yig'iladi. Yangi guruh ochmasdan, hozirgi guruhlarga nechta o'quvchi qo'shilishi mumkin.",
  fik: "FIK (Foydalanish Intensivlik Koeffitsienti). Hisob: amaldagi o'rinsoat ÷ reja o'rinsoat × 100. Reja o'rinsoat = sig'im × ish vaqti.",
};

export const TABLE_TOOLTIPS = {
  capacity:
    "Xonaga sig'a oladigan o'quvchilar soni (jismoniy o'rindiqlar).",
  workingHours:
    "Xonaning bir haftada ishlay oladigan umumiy vaqti.\n\nHisob: markazning kunlik ish soati × 7 kun.\nMisol: 12 soat × 7 = 84 soat.",
  groups:
    "Hozirda shu xonada dars o'tayotgan faol guruhlar soni.\n\nGuruh nomlari va o'quvchilar sonini ko'rish uchun raqam ustiga sichqonchani olib keling.",
  enrolled:
    "Xonadagi barcha guruhlardagi o'quvchilarning umumiy soni.\n\nBir o'quvchi bir nechta guruhda bo'lsa, har bir guruhida alohida sanaladi.",
  emptySeats:
    "Eng to'la guruh dars o'tayotgan paytda bo'sh turadigan o'rindiqlar.\n\nHisob: xona sig'imi − eng katta guruhdagi o'quvchilar soni.\nMisol: sig'im 14, eng katta guruh 12 ta o'quvchi → 2 ta bo'sh o'rin.",
  lessonHours:
    "Xonadagi barcha guruhlarning bir haftadagi dars soatlari yig'indisi.\n\nMisol: 3 ta guruh, har biri haftada 6 soat → 18 soat.",
  coursePrice:
    "Xonadagi guruhlar uchun belgilangan kurs narxlari.\n\nEng kichik va eng katta narx oralig'i ko'rsatilgan. Barcha unikal narxlarni ko'rish uchun sichqonchani olib keling.",
  totalRevenue:
    "Xonadagi barcha guruhlardan olinadigan jami daromad.\n\nHisob: har guruh uchun (o'quvchilar soni × kurs narxi), so'ng yig'iladi.",
  idleTime:
    "Xonaning haftada hech qaysi dars uchun ishlatilmagan vaqti.\n\nHisob: jami ish vaqti − jami dars soatlari.\nMisol: 84 soat − 18 soat = 66 soat bo'sh.\n\nKam bo'sh vaqt = xona yaxshi ishlatilgan.",
  seatHoursScheduled:
    "Xona hozirgi dars jadvalida taklif qilayotgan jami o'rin-soatlar.\n\nO'rinsoat — bu bitta o'rindiq 1 soat ishlatilsa, 1 o'rinsoat hisoblanadi.\n\nHisob: sig'im × jami dars soatlari.\nMisol: 14 ta o'rindiq × 18 soat = 252 o'rinsoat.",
  seatHoursActual:
    "Xonada haqiqatan band bo'layotgan o'rin-soatlar.\n\nHisob: har guruh uchun (o'quvchilar soni × shu guruhning dars soatlari), so'ng yig'iladi.\nMisol: 10 o'quvchi × 6 soat + 12 o'quvchi × 6 soat = 132 o'rinsoat.",
  seatHoursPlanned:
    "Agar xona butun haftalik ish vaqtida to'liq sig'imda ishlasa, qancha o'rinsoat bo'lishi mumkin.\n\nHisob: sig'im × haftalik ish vaqti.\nMisol: 14 ta o'rindiq × 84 soat = 1,176 o'rinsoat.\n\nBu — xonaning maksimal nazariy imkoniyati.",
  fik:
    "FIK — Foydalanish Intensivligi Koeffitsienti.\n\nXonaning o'rin-soat imkoniyatidan necha foizi ishlatilayotganini ko'rsatadi (sig'im × ish vaqti × bandlik).\n\nHisob: amaldagi o'rinsoat ÷ reja o'rinsoat × 100.\n\nDIQQAT: bu yuqoridagi \"Vaqt bandligi\" KPI'sidan farq qiladi. Vaqt bandligi xona qancha vaqt darslar bilan band ekanini ko'rsatadi (dars soatlari ÷ ish soatlari). FIK esa o'rin-soatlar nuqtai nazaridan to'liq foydalanish darajasini hisoblaydi.\n\nRanglar:\n• Yashil — 70% va yuqori (yaxshi)\n• Sariq — 40–70% (o'rta)\n• Qizil — 40% dan kam (yomon)",
};

export const BUCKET_LABELS: Record<CenterActivityBucket, string> = {
  daily: "Kunlik",
  weekly: "Haftalik",
  monthly: "Oylik",
};
