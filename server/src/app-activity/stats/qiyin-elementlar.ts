import { DafSkill, skillFuer } from '../../daf/uebung/format-skill';

export const QIYIN_MIN_OQUVCHI = 3;
export const QIYIN_SONI = 6;

/** SQL yig'indisidan bitta satr: `(itemType, itemId)` bo'yicha birinchi urinishlar. */
export interface ElementAgregati {
  itemType: string;
  itemId: number;
  oquvchilar: number;
  ortachaBall: number;
  /** Eng ko'p uchragan format. */
  format: string | null;
}

export interface QiyinElement {
  itemType: string;
  itemId: number;
  format: string | null;
  konikma: DafSkill | null;
  xatoFoizi: number;
  oquvchilar: number;
}

/** Dizayn 6.5: kamida 3 xil o'quvchi, xato foizi = 1 − o'rtacha ball, eng yuqori 6. */
export function qiyinElementlar(rows: ElementAgregati[]): QiyinElement[] {
  return rows
    .filter((r) => r.oquvchilar >= QIYIN_MIN_OQUVCHI)
    .map((r) => ({
      itemType: r.itemType,
      itemId: r.itemId,
      format: r.format,
      konikma: skillFuer(r.format),
      xatoFoizi: Math.round((1 - r.ortachaBall) * 100),
      oquvchilar: r.oquvchilar,
    }))
    .filter((r) => r.xatoFoizi > 0)
    .sort(
      (a, b) =>
        b.xatoFoizi - a.xatoFoizi ||
        b.oquvchilar - a.oquvchilar ||
        a.itemType.localeCompare(b.itemType) ||
        a.itemId - b.itemId,
    )
    .slice(0, QIYIN_SONI);
}
