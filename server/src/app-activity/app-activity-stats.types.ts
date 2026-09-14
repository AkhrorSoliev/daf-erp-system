import { Davr } from './stats/davr';
import { DarajaQatori, JoriyDaraja, Daraja } from './stats/daraja';
import { KunSurati } from './stats/davr-surati';
import { Platforma } from './stats/kunlik-faollik';
import { KonikmaNatijasi } from './stats/mashq-natijasi';
import { QiyinElement } from './stats/qiyin-elementlar';

/** API javob shartnomasi (dizayn 6–7). Klient `components/groups/app-activity/types.ts` aynan shu. */

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
  /** Har doim oxirgi 30 kun (davrdan qat'i nazar). */
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
    tur: 'LESSON' | 'REVIEW';
    darsNomi: string | null;
    boshlandi: string;
    tugadi: string;
    savollar: number;
    togri: number;
  }[];
}
