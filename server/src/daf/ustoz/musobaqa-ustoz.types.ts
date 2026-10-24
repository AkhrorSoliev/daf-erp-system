/**
 * `GET /groups/:id/musobaqa` javobi va xom qatorlar (spec S5 §5). Mijoz
 * turlari (`client/.../groups/musobaqa/types.ts`) shuni qo'lda aks ettiradi.
 */
export type GuruhHolati = 'JADVALDA' | 'KAM_AZO' | 'FAOL_EMAS' | 'YOZUV_YOQ';

export interface MusobaqaGuruh {
  holat: GuruhHolati;
  orin: number | null;
  /** Jadvaldagi (yoki o'sha hafta joylashgan) guruhlar soni. */
  guruhSoni: number | null;
  baho: number | null;
  azolar: number;
  ball: number;
  minAzolar: number;
}

export interface MusobaqaTarixQatori {
  haftaBoshi: string;
  orin: number | null;
  baho: number | null;
}

export interface MusobaqaOquvchi {
  studentId: number;
  ism: string;
  akkaunt: boolean;
  guruhBali: number;
  jamiBall: number;
  faolKunlar: number;
  seriya: number | null;
  bugunBali: number | null;
  maqsadBali: number | null;
  liga: string;
  nishonlar: number;
  oxirgiMashq: string | null;
}

export interface MusobaqaJavob {
  /** Toshkent kuni — mijoz «3 kun oldin» ni shundan sanaydi. */
  bugun: string;
  haftaBoshi: string;
  joriy: boolean;
  haftalar: string[];
  guruh: MusobaqaGuruh;
  tarix: MusobaqaTarixQatori[];
  oquvchilar: MusobaqaOquvchi[];
}

export interface AzoMalumoti {
  studentId: number;
  ism: string;
  akkaunt: boolean;
  tier: number;
  dailyGoal: string | null;
  nishonlar: number;
}

export interface AzoBalli {
  studentId: number;
  guruhBali: number;
  jamiBall: number;
  faolKunlar: number;
}

export interface AzoKunlari {
  studentId: number;
  /** `attempts > 0` bo'lgan kunlar, `YYYY-MM-DD`. */
  tage: string[];
  bugunBali: number;
}
