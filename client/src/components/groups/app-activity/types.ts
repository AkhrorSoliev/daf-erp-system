// Server: server/src/app-activity/app-activity-stats.types.ts — nomlar aynan shu.

export type Davr = 7 | 30;

export type Platforma = "WEB" | "ANDROID" | "IOS";

export type Daraja = "A1" | "A2" | "B1";

export type DarajaHolati = "DAVOM" | "TUGATILGAN" | "BOSHLANMAGAN" | "KURS_YOQ";

export type DafSkill = "WORTSCHATZ" | "GRAMMATIK" | "HOEREN" | "LESEN" | "SCHREIBEN" | "SPRECHEN";

export interface DarajaQatori {
  daraja: Daraja;
  tugatilgan: number;
  jami: number;
  holat: DarajaHolati;
}

export interface JoriyDaraja extends DarajaQatori {
  guruhdanOrqada: boolean;
}

export interface KunSurati {
  sana: string;
  faolSoniya: number;
  radioSoniya: number;
  savollar: number;
  shugullangan: boolean;
  kirdi: boolean;
  kuzatilgan: boolean;
}

export interface KonikmaNatijasi {
  konikma: DafSkill;
  savollar: number;
  togri: number;
  foiz: number | null;
}

export interface QiyinElement {
  itemType: string;
  itemId: number;
  format: string | null;
  konikma: DafSkill | null;
  xatoFoizi: number;
  oquvchilar: number;
}

export interface OxirgiFaollik {
  vaqt: string; // ISO
  platforma: Platforma;
}

export interface GuruhOquvchiQatori {
  studentId: number;
  ism: string;
  photo: string | null;
  akkaunt: boolean;
  oxirgiFaollik: OxirgiFaollik | null;
  faolSoniya: number;
  radioSoniya: number;
  kirdi: boolean;
  shugullanganKunlar: number;
  maxraj: number;
  hisobBoshi: string;
  kunlar: KunSurati[];
  mashq: { savollar: number; togri: number; foiz: number | null };
  kurs: JoriyDaraja;
}

export interface GuruhKartalari {
  oquvchilar: number;
  akkauntlar: number;
  kirganlar: number;
  ortachaFaolSoniya: number | null;
  savollar: number;
  foiz: number | null;
  tugatilganDarslar: number;
  radioSoniya: number;
  radioTinglaganlar: number;
}

export interface GuruhQiyinElement extends QiyinElement {
  de: string;
  uz: string | null;
}

export interface GuruhFaolligi {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  guruhDarajasi: Daraja | null;
  kartalar: GuruhKartalari;
  oquvchilar: GuruhOquvchiQatori[];
  qiyinElementlar: GuruhQiyinElement[];
}

export interface OquvchiBolimi {
  unitId: number;
  nomi: string;
  tugatilgan: number;
  jami: number;
}

export interface OquvchiFaolligi {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  studentId: number;
  ism: string;
  photo: string | null;
  akkaunt: boolean;
  hisobBoshi: string;
  maxraj: number;
  oxirgiFaollik: OxirgiFaollik | null;
  fortschritt: {
    gesamt: number;
    stufe: { de: string; uz: string };
    serie: number;
  };
  vaqt: {
    faolSoniya: number;
    radioSoniya: number;
    kirdi: boolean;
    platforma: Record<Platforma, number>;
    bolim: { LERNEN: number; OTHER: number };
  };
  shugullanganKunlar: number;
  xarita: KunSurati[];
  mashq: {
    savollar: number;
    togri: number;
    xatolar: number;
    foiz: number | null;
    konikmalar: KonikmaNatijasi[];
  };
  darajalar: (DarajaQatori & { tugatilganSana: string | null })[];
  joriyDaraja: JoriyDaraja;
  bolimlar: OquvchiBolimi[];
  sozlar: {
    mustahkam: number;
    organilmoqda: number;
    yangi: number;
    bugunTakror: number;
  };
  qiyinSozlar: {
    lexemeId: number;
    de: string;
    uz: string | null;
    xatolar: number;
  }[];
  seanslar: {
    id: string;
    tur: "LESSON" | "REVIEW";
    darsNomi: string | null;
    boshlandi: string;
    tugadi: string;
    savollar: number;
    togri: number;
  }[];
}
