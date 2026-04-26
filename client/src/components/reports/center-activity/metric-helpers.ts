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
    "Markazning umumiy foydalanish darajasi. Hisob: jami amaldagi o'rinsoat ÷ jami reja o'rinsoat × 100. Yuqori foiz yaxshi samaradorlikni bildiradi.",
  emptyHours:
    "Xonalarning bo'sh qolgan ish vaqti soatlari. Hisob: jami ish soatlari − jami dars soatlari. Kam bo'sh vaqt yaxshi foydalanishni bildiradi.",
  activeStudents:
    "Hozirda ta'lim olayotgan o'quvchilar soni. Bir o'quvchi bir nechta guruhda bo'lsa ham bir marta sanaladi.",
  potentialRevenue:
    "Agar markaz to'liq sig'imda ishlasa, qancha qo'shimcha daromad olinadi. Hisob: har bir guruh uchun (sig'im − o'quvchilar) × kurs narxi.",
  emptySeats:
    "Xonadagi bo'sh o'rinlar soni. Hisob: har xona uchun sig'im − eng ko'p o'quvchili guruh. Kam bo'sh o'rin yaxshi foydalanishni bildiradi.",
  extraStudents:
    "Yana qancha o'quvchi qabul qilish mumkin. Bo'sh o'rinlar soniga teng — boshqacha qaralgan ko'rsatkich.",
  fik: "FIK (Foydalanish Intensivlik Koeffitsienti). Hisob: amaldagi o'rinsoat ÷ reja o'rinsoat × 100. Reja o'rinsoat = sig'im × ish vaqti.",
};

export const BUCKET_LABELS: Record<CenterActivityBucket, string> = {
  daily: "Kunlik",
  weekly: "Haftalik",
  monthly: "Oylik",
};
