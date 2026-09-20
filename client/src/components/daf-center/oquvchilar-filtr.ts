import {
  HOLATLAR,
  SARALASHLAR,
  type Daraja,
  type Davr,
  type Holat,
  type Saralash,
  type Yonalish,
} from "./types";

/** Sahifa holati — hammasi URL da (dizayn 6.1), havola bilan ulashiladi. */
export interface OquvchilarFiltri {
  davr: Davr;
  status: Holat[];
  kirgan: "ha" | "yoq" | null;
  groupId: string | null;
  teacherId: number | null;
  level: Daraja | null;
  q: string;
  sort: Saralash;
  dir: Yonalish;
  page: number;
}

export const SAHIFA_HAJMI = 50;

export const STANDART_FILTR: OquvchilarFiltri = {
  davr: 7,
  status: [],
  kirgan: null,
  groupId: null,
  teacherId: null,
  level: null,
  q: "",
  sort: "holat",
  dir: "asc",
  page: 1,
};

const DARAJALAR: Daraja[] = ["A1", "A2", "B1"];

export function filtrniUrldanOqi(sp: URLSearchParams): OquvchilarFiltri {
  const status = (sp.get("status") ?? "")
    .split(",")
    .filter((s): s is Holat => (HOLATLAR as string[]).includes(s));
  const kirgan = sp.get("kirgan");
  const level = sp.get("level");
  const sort = sp.get("sort");
  const dir = sp.get("dir");
  const page = Number(sp.get("page"));
  const teacherId = Number(sp.get("teacherId"));
  return {
    davr: sp.get("period") === "30" ? 30 : 7,
    status,
    kirgan: kirgan === "ha" || kirgan === "yoq" ? kirgan : null,
    groupId: sp.get("groupId") || null,
    teacherId: Number.isInteger(teacherId) && teacherId > 0 ? teacherId : null,
    level: DARAJALAR.includes(level as Daraja) ? (level as Daraja) : null,
    q: sp.get("q") ?? "",
    sort: (SARALASHLAR as readonly string[]).includes(sort ?? "") ? (sort as Saralash) : "holat",
    dir: dir === "desc" ? "desc" : "asc",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Standartdan farq qilgan maydonlar bilan `?...`; hammasi standart bo'lsa `""`. */
export function filtrniUrlgaYoz(f: OquvchilarFiltri): string {
  const p = new URLSearchParams();
  if (f.davr !== 7) p.set("period", String(f.davr));
  if (f.status.length > 0) p.set("status", f.status.join(","));
  if (f.kirgan) p.set("kirgan", f.kirgan);
  if (f.groupId) p.set("groupId", f.groupId);
  if (f.teacherId !== null) p.set("teacherId", String(f.teacherId));
  if (f.level) p.set("level", f.level);
  if (f.q) p.set("q", f.q);
  if (f.sort !== "holat") p.set("sort", f.sort);
  if (f.dir !== "asc") p.set("dir", f.dir);
  if (f.page > 1) p.set("page", String(f.page));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

/** `GET /app-activity/center/students` uchun parametrlar (`CenterStudentsQueryDto`). */
export function sorovParametrlari(f: OquvchilarFiltri): Record<string, string | number | undefined> {
  const q = f.q.trim();
  return {
    period: f.davr,
    status: f.status.length > 0 ? f.status.join(",") : undefined,
    kirgan: f.kirgan ?? undefined,
    groupId: f.groupId ?? undefined,
    teacherId: f.teacherId ?? undefined,
    level: f.level ?? undefined,
    q: q || undefined,
    sort: f.sort,
    dir: f.dir,
    page: f.page,
    pageSize: SAHIFA_HAJMI,
  };
}
