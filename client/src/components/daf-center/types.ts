// Server: server/src/app-activity/center/center-app-activity.types.ts va
// server/src/app-activity/norma/norma.ts — nomlar aynan shu.
import type {
  Daraja,
  Davr,
  JoriyDaraja,
  KunSurati,
  OxirgiFaollik,
} from "@/components/groups/app-activity/types";

export type { Daraja, Davr, JoriyDaraja, KunSurati, OxirgiFaollik };

export type Holat = "AKKAUNT_YOQ" | "HECH_KIRMAGAN" | "QIZIL" | "SARIQ" | "YASHIL";
/** Standart saralash tartibida. */
export const HOLATLAR: Holat[] = ["HECH_KIRMAGAN", "QIZIL", "SARIQ", "YASHIL", "AKKAUNT_YOQ"];

export const SARALASHLAR = ["holat", "faolKun", "vaqt", "foiz", "oxirgi", "ism", "guruh"] as const;
export type Saralash = (typeof SARALASHLAR)[number];
export type Yonalish = "asc" | "desc";

export interface Norma {
  kunlikDaqiqa: number;
  kunlikSavol: number;
  haftalikKun: number;
  sariqKun: number;
}

export interface MarkazOquvchiQatori {
  studentId: number;
  ism: string;
  photo: string | null;
  guruh: { id: string; nomi: string; daraja: Daraja | null } | null;
  oqituvchi: { id: number; ism: string } | null;
  filial: { id: number; nomi: string } | null;
  akkaunt: boolean;
  hechKirmagan: boolean;
  kirdi: boolean;
  holat: Holat;
  faolKun: number;
  maxraj: number;
  hisobBoshi: string;
  kerakliKun: number;
  sariqKerak: number;
  kunlar: KunSurati[];
  lernenSoniya: number;
  ortachaKunlikSoniya: number;
  savollar: number;
  togri: number;
  foiz: number | null;
  oxirgiFaollik: OxirgiFaollik | null;
  kurs: JoriyDaraja | null;
}

export interface MarkazKartalari {
  oquvchilar: number;
  akkauntlar: number;
  birMartaKirganlar: number;
  davrdaKirganlar: number;
  yashillar: number;
  normaFoiz: number | null;
  kerakliKun: number;
  ortachaFaolKunHaftada: number | null;
  ortachaKunlikSoniya: number | null;
  savollar: number;
  togri: number;
  foiz: number | null;
  tugatilganDarslar: number;
}

export interface MarkazVoronka {
  faolOquvchi: number;
  akkauntiBor: number;
  birMartaKirgan: number;
  davrdaKirgan: number;
  normaniBajargan: number;
}

export interface MarkazTrendKuni {
  sana: string;
  kirganlar: number;
  faollar: number;
}

export interface MarkazFilialQatori {
  branchId: number;
  nomi: string;
  oquvchilar: number;
  qamrovFoiz: number | null;
  normaFoiz: number | null;
  ortachaFaolKunHaftada: number | null;
  foiz: number | null;
  tugatilganDarslar: number;
}

export interface MarkazUmumiy {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  norma: Norma;
  kartalar: MarkazKartalari;
  voronka: MarkazVoronka;
  trend: MarkazTrendKuni[];
  filiallar: MarkazFilialQatori[];
}

export interface MarkazFiltrVariantlari {
  guruhlar: { id: string; nomi: string }[];
  oqituvchilar: { id: number; ism: string }[];
  darajalar: Daraja[];
}

export interface MarkazOquvchilar {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  norma: Norma;
  jami: number;
  sahifa: number;
  sahifaHajmi: number;
  qatorlar: MarkazOquvchiQatori[];
  filtrVariantlari: MarkazFiltrVariantlari;
  filialUstuni: boolean;
}

export interface MarkazTelefonQatori {
  ism: string;
  guruh: string | null;
  telefon: string;
  otaOnaTelefoni: string | null;
}

export interface MarkazTelefonlar {
  jami: number;
  qisqartirildi: boolean;
  qatorlar: MarkazTelefonQatori[];
}
