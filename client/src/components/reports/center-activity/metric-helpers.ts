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
  return `${hours.toLocaleString("en-US", { maximumFractionDigits: 1 })} soat`;
}

export function formatPctValue(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return `${pct.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

export function formatCount(count: number, suffix = "ta"): string {
  return `${count.toLocaleString("en-US")} ${suffix}`;
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
    "Markazning umumiy foydalanish darajasi. Hisob: xonalarning jami band soatlari ÷ jami ish soatlari × 100. Yuqori foiz xona vaqti yaxshi ishlatilganini bildiradi.",
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
    "Xonaning maksimal o'quvchi sig'imi (jismoniy o'rindiqlar soni).",
  workingHours:
    "Xonaning haftalik ish soati. Hisob: markaz kunlik ish soati × 7 kun. Misol: 12h × 7 = 84h.",
  groups:
    "Xonada dars o'tayotgan faol guruhlar soni. Sichqonchani ustiga olib kelsangiz guruh nomlari va o'quvchi soni ko'rinadi.",
  enrolled:
    "Xona guruhlaridagi jami o'quvchilar yig'indisi. Bir o'quvchi bir nechta guruhda bo'lsa, har birida sanaladi.",
  emptySeats:
    "Bir vaqtning o'zida bo'sh turgan jismoniy o'rindiqlar soni. Hisob: sig'im − eng ko'p o'quvchili guruh.",
  lessonHours:
    "Xonadagi barcha guruhlar uchun jami haftalik dars soatlari. Misol: 3 guruh × har biri 6h = 18h.",
  coursePrice:
    "Guruhlardagi unikal kurs narxlari oralig'i. Sichqonchani ustiga olib kelsangiz barcha unikal narxlar ko'rinadi.",
  totalRevenue:
    "Xonadan olinadigan jami daromad. Hisob: har guruh uchun (o'quvchilar × kurs narxi), barchasi yig'iladi.",
  idleTime:
    "Xonaning haftada bo'sh qolgan ish vaqti. Hisob: ish vaqti − jami dars soatlari. Misol: 84h − 18h = 66h. Kam bo'sh vaqt yaxshi foydalanishni bildiradi.",
  seatHoursScheduled:
    "Xonada haftada amalda taklif qilinayotgan o'rin-soatlar. Hisob: sig'im × jami dars soatlari. Misol: 14 stol × 18h dars = 252 o'rinsoat. Bu — guruhlar tashkil etilgan vaqtdagi maksimal sig'im.",
  seatHoursActual:
    "Haqiqatan band bo'lgan o'rin-soatlar. Hisob: har guruh uchun (o'quvchilar × dars soatlari), barchasi yig'iladi. Misol: 10 × 6h + 12 × 6h = 132 o'rinsoat.",
  seatHoursPlanned:
    "Nazariy maksimal o'rin-soatlar (agar xona to'liq sig'imda butun ish vaqtida ishlasa). Hisob: sig'im × ish vaqti. Misol: 14 stol × 84h = 1,176 o'rinsoat.",
  fik:
    "FIK — Foydalanish Intensivligi Koeffitsienti. Hisob: amaldagi o'rinsoat ÷ reja o'rinsoat × 100. Yashil ≥ 70%, sariq 40-70%, qizil < 40%.",
};

export const BUCKET_LABELS: Record<CenterActivityBucket, string> = {
  daily: "Kunlik",
  weekly: "Haftalik",
  monthly: "Oylik",
};
