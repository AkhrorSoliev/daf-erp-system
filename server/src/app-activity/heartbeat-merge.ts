/**
 * Faollik seansining jami qiymatlarini birlashtiradi (dizayn 4.2–4.3).
 *
 * Klient seans boshidan JAMI qiymat yuboradi, delta emas. Shuning uchun har
 * maydonda `max(eski, yangi)` olinadi — takroriy yoki kechikib kelgan so'rov
 * vaqtni hech qachon ko'paytirmaydi va kamaytirmaydi.
 *
 * SOAT BILAN QIRQISH: qiymat server ko'rgan davomiylikdan (`hozir −
 * firstSeenAt`) + 120 s dan oshmaydi. Qo'lda soxta katta raqam yuborib
 * bo'lmaydi — eng yomon holatda «ilova ochiq bo'lgan butun vaqt» sanaladi.
 */

export const SOAT_ZAXIRASI_S = 120;

export type Bolim = 'LERNEN' | 'OTHER';
export const BOLIMLAR: readonly Bolim[] = ['LERNEN', 'OTHER'];
export type Bolimlar = Partial<Record<Bolim, number>>;

export interface SeansQiymatlari {
  activeSeconds: number;
  radioSeconds: number;
  sections: Bolimlar;
}

function butun(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

/** Bazadagi yoki so'rovdagi `sections` ni xavfsiz o'qiydi: faqat ma'lum kalitlar, musbat butun son. */
export function bolimlarniOqi(json: unknown): Bolimlar {
  const natija: Bolimlar = {};
  if (!json || typeof json !== 'object' || Array.isArray(json)) return natija;
  for (const b of BOLIMLAR) {
    const v = (json as Record<string, unknown>)[b];
    if (typeof v === 'number' && butun(v) > 0) natija[b] = butun(v);
  }
  return natija;
}

export function birlashtir(
  mavjud: SeansQiymatlari | null,
  kelgan: SeansQiymatlari,
  firstSeenAt: Date,
  now: Date,
): SeansQiymatlari {
  const ship =
    Math.max(0, Math.floor((now.getTime() - firstSeenAt.getTime()) / 1000)) +
    SOAT_ZAXIRASI_S;
  const qirq = (eski: number, yangi: number) =>
    Math.min(Math.max(butun(eski), butun(yangi)), ship);

  const activeSeconds = qirq(mavjud?.activeSeconds ?? 0, kelgan.activeSeconds);
  const radioSeconds = qirq(mavjud?.radioSeconds ?? 0, kelgan.radioSeconds);

  const sections: Bolimlar = {};
  let jami = 0;
  for (const b of BOLIMLAR) {
    const v = Math.max(
      butun(mavjud?.sections[b] ?? 0),
      butun(kelgan.sections[b] ?? 0),
    );
    if (v > 0) {
      sections[b] = v;
      jami += v;
    }
  }
  // Bo'limlar faol vaqtning taqsimoti — yig'indisi undan oshsa, mutanosib kamaytiriladi.
  if (jami > activeSeconds) {
    const koef = activeSeconds / jami;
    for (const b of BOLIMLAR) {
      const v = sections[b];
      if (v !== undefined) sections[b] = Math.floor(v * koef);
    }
  }
  return { activeSeconds, radioSeconds, sections };
}
