export type Daraja = 'A1' | 'A2' | 'B1';
export const DARAJALAR: readonly Daraja[] = ['A1', 'A2', 'B1'];

export type DarajaHolati = 'DAVOM' | 'TUGATILGAN' | 'BOSHLANMAGAN' | 'KURS_YOQ';

export interface DarajaQatori {
  daraja: Daraja;
  tugatilgan: number;
  jami: number;
  holat: DarajaHolati;
}

export interface JoriyDaraja extends DarajaQatori {
  guruhdanOrqada: boolean;
}

type Sonlar = Partial<Record<Daraja, number>>;

/** `Group.level` erkin matn — boshidagi A1/A2/B1 olinadi. */
export function guruhDarajasi(level: string | null): Daraja | null {
  const m = /^(A1|A2|B1)/i.exec(level?.trim() ?? '');
  return m ? (m[1].toUpperCase() as Daraja) : null;
}

function qator(daraja: Daraja, tugatilgan: Sonlar, jami: Sonlar): DarajaQatori {
  const t = tugatilgan[daraja] ?? 0;
  const j = jami[daraja] ?? 0;
  const holat: DarajaHolati =
    j === 0
      ? 'KURS_YOQ'
      : t >= j
        ? 'TUGATILGAN'
        : t === 0
          ? 'BOSHLANMAGAN'
          : 'DAVOM';
  return { daraja, tugatilgan: t, jami: j, holat };
}

export function darajaQatorlari(
  tugatilgan: Sonlar,
  jami: Sonlar,
): DarajaQatori[] {
  return DARAJALAR.map((d) => qator(d, tugatilgan, jami));
}

/**
 * Dizayn 6.4. Joriy daraja — oxirgi LESSON seansidagi darsning darajasi; u
 * to'liq tugatilgan va keyingi darajada kurs bo'lsa — keyingi daraja.
 * LESSON seansi bo'lmasa — guruh darajasi, u ham bo'lmasa A1.
 */
export function joriyDaraja(input: {
  oxirgiDarsDarajasi: Daraja | null;
  guruhDarajasi: Daraja | null;
  tugatilgan: Sonlar;
  jami: Sonlar;
}): JoriyDaraja {
  const { oxirgiDarsDarajasi, tugatilgan, jami } = input;
  let daraja: Daraja = oxirgiDarsDarajasi ?? input.guruhDarajasi ?? 'A1';
  if (oxirgiDarsDarajasi) {
    const joriy = qator(daraja, tugatilgan, jami);
    const keyingi = DARAJALAR[DARAJALAR.indexOf(daraja) + 1];
    if (joriy.holat === 'TUGATILGAN' && keyingi && (jami[keyingi] ?? 0) > 0) {
      daraja = keyingi;
    }
  }
  const guruh = input.guruhDarajasi;
  return {
    ...qator(daraja, tugatilgan, jami),
    guruhdanOrqada:
      guruh !== null && DARAJALAR.indexOf(daraja) < DARAJALAR.indexOf(guruh),
  };
}
