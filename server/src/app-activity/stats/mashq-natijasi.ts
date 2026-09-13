import { tashkentDateStr } from '../../common/date/tashkent';
import { DafSkill, skillFuer } from '../../daf/uebung/format-skill';
import { savolNatijalari, UrinishSatri } from '../../daf/uebung/seans-natija';

export interface MashqUrinishi extends UrinishSatri {
  sessionId: string | null;
  createdAt: Date;
}

/** Ekranda ko'rsatish tartibi (dizayn 5.4). SPRECHEN — hozircha format yo'q. */
export const KONIKMALAR: readonly DafSkill[] = [
  'WORTSCHATZ',
  'GRAMMATIK',
  'LESEN',
  'HOEREN',
  'SCHREIBEN',
  'SPRECHEN',
];

export interface KonikmaNatijasi {
  konikma: DafSkill;
  savollar: number;
  togri: number;
  foiz: number | null;
}

export interface MashqNatijasi {
  savollar: number;
  togri: number;
  xatolar: number;
  foiz: number | null;
  konikmalar: KonikmaNatijasi[];
  /** Toshkent kuni → shu kuni birinchi berilgan savollar soni. */
  savolKunlari: Record<string, number>;
}

export function foizi(togri: number, jami: number): number | null {
  return jami === 0 ? null : Math.round((togri * 100) / jami);
}

/**
 * To'g'ri javob % (dizayn 3-bo'lim) — seanslar bo'yicha `savolNatijalari`
 * dan. `sessionId` bo'sh urinishlar (eski klient, DiB yo'llari) savol
 * ko'rsatkichlariga kirmaydi.
 */
export function mashqNatijasi(urinishlar: MashqUrinishi[]): MashqNatijasi {
  const seanslar = new Map<string, MashqUrinishi[]>();
  for (const u of urinishlar) {
    if (!u.sessionId) continue;
    const royxat = seanslar.get(u.sessionId) ?? [];
    royxat.push(u);
    seanslar.set(u.sessionId, royxat);
  }

  const konikma = new Map<DafSkill, { savollar: number; togri: number }>(
    KONIKMALAR.map((k) => [k, { savollar: 0, togri: 0 }]),
  );
  const savolKunlari: Record<string, number> = {};
  let savollar = 0;
  let togri = 0;

  for (const royxat of seanslar.values()) {
    for (const n of savolNatijalari(royxat)) {
      savollar += 1;
      if (n.togri) togri += 1;
      const k = skillFuer(n.format);
      if (k) {
        const hisob = konikma.get(k)!;
        hisob.savollar += 1;
        if (n.togri) hisob.togri += 1;
      }
      if (n.vaqt) {
        const kun = tashkentDateStr(n.vaqt);
        savolKunlari[kun] = (savolKunlari[kun] ?? 0) + 1;
      }
    }
  }

  return {
    savollar,
    togri,
    xatolar: savollar - togri,
    foiz: foizi(togri, savollar),
    konikmalar: KONIKMALAR.map((k) => {
      const h = konikma.get(k)!;
      return {
        konikma: k,
        savollar: h.savollar,
        togri: h.togri,
        foiz: foizi(h.togri, h.savollar),
      };
    }),
    savolKunlari,
  };
}
