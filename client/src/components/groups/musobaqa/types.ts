// Server: server/src/daf/ustoz/musobaqa-ustoz.types.ts — maydon nomlari aynan shu.
export type GuruhHolati = "JADVALDA" | "KAM_AZO" | "FAOL_EMAS" | "YOZUV_YOQ";

export interface MusobaqaGuruh {
  holat: GuruhHolati;
  orin: number | null;
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
  bugun: string;
  haftaBoshi: string;
  joriy: boolean;
  haftalar: string[];
  guruh: MusobaqaGuruh;
  tarix: MusobaqaTarixQatori[];
  oquvchilar: MusobaqaOquvchi[];
}
