/**
 * `GET /daf/media/jang` javobi — server: `daf-media-jang.shape.ts`
 * (`JangOverview`). Mijoz serverning fayllarini import qila olmaydi, shuning
 * uchun shakl shu yerda bir xil nomlar bilan qaytadan e'lon qilinadi.
 */

export type JangKind = "CHOOSE" | "TYPE" | "LISTEN";
export type JangStatus = "DRAFT" | "APPROVED";

export interface JangAudio {
  url: string;
  startMs: number | null;
  endMs: number | null;
}

export interface JangQuestion {
  id: number;
  /** To'liq raqam: `jang-a1-u02-023` — CEO savolni shu bilan aytadi. */
  sourceId: string;
  /** Oxirgi uch raqam: `023`. */
  raqam: string;
  kind: JangKind;
  prompt: string;
  options: string[];
  answer: string;
  /** Javob sifatida qabul qilinadigan boshqa yozilishlar (faqat «Yozish»). */
  akzeptiert: string[];
  status: JangStatus;
  audio: JangAudio | null;
}

export interface JangUnitCounts {
  jami: number;
  tasdiqlangan: number;
  qoralama: number;
  choose: number;
  type: number;
  listen: number;
}

export interface JangUnit {
  unitId: number;
  code: string;
  order: number;
  titleUz: string;
  titleDe: string;
  /** Savollar yashaydigan manba fayl: `a1-u02.json`. */
  fayl: string;
  counts: JangUnitCounts;
  questions: JangQuestion[];
}

export interface JangOverview {
  units: JangUnit[];
}
