import { OxirgiFaollik } from '../app-activity-stats.types';
import { Holat, Norma } from '../norma/norma';
import { Daraja, JoriyDaraja } from '../stats/daraja';
import { Davr } from '../stats/davr';
import { KunSurati } from '../stats/davr-surati';

/**
 * Markaz sahifalari javob shartnomasi (dizayn 5–6). Klient
 * `components/daf-center/types.ts` aynan shu nomlar bilan.
 */

/** «Ro'yxatni nusxalash» chegarasi (dizayn 6.4). */
export const TELEFON_CHEGARASI = 2000;

export interface GuruhAzoligi {
  id: string;
  nomi: string;
  daraja: Daraja | null;
  /** Yozuv boshlanishi (ISO) — bir nechta guruhda eng ertasi ko'rsatiladi. */
  boshlanish: string;
  oqituvchilar: { id: number; ism: string }[];
}

/**
 * Servisning ICHKI qatori — populyatsiya + yig'indi + qaror. Filtr, saralash
 * va sahifalash shu ustida ishlaydi (`markaz-royxat.ts`), tashqariga
 * `MarkazOquvchiQatori` chiqadi.
 */
export interface OquvchiHisobi {
  studentId: number;
  ism: string;
  photo: string | null;
  telefon: string;
  otaOnaTelefoni: string | null;
  akkaunt: boolean;
  hechKirmagan: boolean;
  /** Tanlangan davr ichida kamida bitta seansda >= 10 s. */
  kirdi: boolean;
  holat: Holat;
  faolKun: number;
  maxraj: number;
  hisobBoshi: string;
  kerakliKun: number;
  sariqKerak: number;
  /** Tanlangan davr kunlari; `shugullangan` = faol kun (norma bo'yicha). */
  kunlar: KunSurati[];
  /** Har doim oxirgi 30 kun — trend uchun. */
  kun30: KunSurati[];
  lernenSoniya: number;
  savollar: number;
  togri: number;
  foiz: number | null;
  tugatilganDarslar: number;
  oxirgiFaollik: OxirgiFaollik | null;
  guruhlar: GuruhAzoligi[];
  filial: { id: number; nomi: string } | null;
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
  /** `lernenSoniya / maxraj` — kuniga o'rtacha. */
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
  /** Butun tarixda kamida bir marta kirgan. */
  birMartaKirganlar: number;
  /** Tanlangan davr ichida kirgan. */
  davrdaKirganlar: number;
  yashillar: number;
  /** Davrda kirganlar orasida, `faolKun / maxraj × 7`, 1 kasr. */
  ortachaFaolKunHaftada: number | null;
  /** Davrda kirganlar orasida, `lernenSoniya / maxraj`. */
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
  /** Har doim 30 kun. */
  trend: MarkazTrendKuni[];
  /** Faqat scope `null` (hamma filial) bo'lganda; aks holda `[]`. */
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
  /** Scope `null` — «Filial» ustuni ko'rsatiladi. */
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
