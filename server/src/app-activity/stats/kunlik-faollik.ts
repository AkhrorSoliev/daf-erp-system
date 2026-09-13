import { Bolim, bolimlarniOqi, SOAT_ZAXIRASI_S } from '../heartbeat-merge';

export type Platforma = 'WEB' | 'ANDROID' | 'IOS';
export const PLATFORMALAR: readonly Platforma[] = ['WEB', 'ANDROID', 'IOS'];

/** Dizayn 3-bo'lim: shug'ullangan kun uchun kunlik radio chegarasi. */
export const RADIO_KUN_CHEGARASI_S = 300;
/** Dizayn 3-bo'lim: «Ilovaga kirgan» uchun bitta seansning faol chegarasi. */
export const KIRDI_CHEGARASI_S = 10;

export interface SeansSatri {
  /** Toshkent kuni, `YYYY-MM-DD`. */
  day: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  activeSeconds: number;
  radioSeconds: number;
  platform: Platforma;
  sections: unknown;
}

export interface KunYigindisi {
  sana: string;
  faolSoniya: number;
  radioSoniya: number;
  platforma: Record<Platforma, number>;
  bolim: Record<Bolim, number>;
  kirdi: boolean;
}

/** `@db.Date` qiymatini `YYYY-MM-DD` ga (u UTC yarim tuni sifatida keladi). */
export function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Oraliqlar (ms) birlashmasining uzunligi, butun soniyalarda. */
export function birlashmaSoniyasi(oraliqlar: [number, number][]): number {
  const tartib = [...oraliqlar].sort((a, b) => a[0] - b[0]);
  let jami = 0;
  let boshi = -Infinity;
  let oxiri = -Infinity;
  for (const [a, b] of tartib) {
    if (a > oxiri) {
      if (oxiri > boshi) jami += oxiri - boshi;
      boshi = a;
      oxiri = b;
    } else if (b > oxiri) {
      oxiri = b;
    }
  }
  if (oxiri > boshi) jami += oxiri - boshi;
  return Math.floor(jami / 1000);
}

/**
 * Seanslarni Toshkent kunlariga yig'adi. Server qirqishi seans bo'yicha
 * (ADR-0020), shuning uchun parallel seanslar kun yig'indisini ko'paytirmasin:
 * faol va radio yig'indisi shu kun seanslarining `[firstSeenAt, lastSeenAt +
 * 120 s]` birlashmasidan oshmaydi. Platforma va bo'limlar faol vaqt bilan bir
 * xil nisbatda qisqaradi.
 */
export function kunlikYigindi(
  seanslar: SeansSatri[],
): Map<string, KunYigindisi> {
  const kunlar = new Map<string, SeansSatri[]>();
  for (const s of seanslar) {
    const royxat = kunlar.get(s.day) ?? [];
    royxat.push(s);
    kunlar.set(s.day, royxat);
  }

  const natija = new Map<string, KunYigindisi>();
  for (const [sana, royxat] of kunlar) {
    const birlashma = birlashmaSoniyasi(
      royxat.map((s) => [
        s.firstSeenAt.getTime(),
        s.lastSeenAt.getTime() + SOAT_ZAXIRASI_S * 1000,
      ]),
    );
    const faolXom = royxat.reduce((j, s) => j + s.activeSeconds, 0);
    const radioXom = royxat.reduce((j, s) => j + s.radioSeconds, 0);
    const faolSoniya = Math.min(faolXom, birlashma);
    const nisbat = faolXom > 0 ? faolSoniya / faolXom : 0;

    const platforma: Record<Platforma, number> = { WEB: 0, ANDROID: 0, IOS: 0 };
    const bolim: Record<Bolim, number> = { LERNEN: 0, OTHER: 0 };
    for (const s of royxat) {
      platforma[s.platform] += s.activeSeconds;
      const b = bolimlarniOqi(s.sections);
      bolim.LERNEN += b.LERNEN ?? 0;
      bolim.OTHER += b.OTHER ?? 0;
    }
    for (const p of PLATFORMALAR)
      platforma[p] = Math.round(platforma[p] * nisbat);
    bolim.LERNEN = Math.round(bolim.LERNEN * nisbat);
    bolim.OTHER = Math.round(bolim.OTHER * nisbat);

    natija.set(sana, {
      sana,
      faolSoniya,
      radioSoniya: Math.min(radioXom, birlashma),
      platforma,
      bolim,
      kirdi: royxat.some((s) => s.activeSeconds >= KIRDI_CHEGARASI_S),
    });
  }
  return natija;
}
