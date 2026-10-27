export interface JangHolati {
  yoqilgan: boolean;
  ochiq: boolean;
  bugunQoldi: number;
  golibSoni: number;
  seriya: number;
}
export interface JangRaqibi {
  tur: 'GHOST' | 'BOT';
  studentId: number | null;
  ism: string;
  rasm: string | null;
  golibSoni: number | null;
}
export interface JangSavoli {
  pozitsiya: number;
  kind: 'CHOOSE' | 'TYPE' | 'LISTEN';
  prompt: string;
  options: string[];
  audio: { url: string; startMs: number | null; endMs: number | null } | null;
}
export interface JangBoshlandi {
  jangId: number;
  kirishMs: number;
  raqib: JangRaqibi;
  savollar: JangSavoli[];
}
export interface JavobNatijasi {
  togri: boolean;
  togriJavob: string;
  raqib: { togri: boolean; ms: number };
}
export interface YakunNatijasi {
  natija: 'WIN' | 'LOSS' | 'DRAW';
  men: { togri: number; ms: number };
  raqib: { togri: number; ms: number };
  yangiNishonlar: string[];
}
