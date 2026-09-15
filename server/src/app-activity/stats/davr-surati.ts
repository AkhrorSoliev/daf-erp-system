import { tashkentDateStr } from '../../common/date/tashkent';
import { DavrOynasi } from './davr';
import {
  kunlikYigindi,
  Platforma,
  RADIO_KUN_CHEGARASI_S,
  SeansSatri,
} from './kunlik-faollik';
import { mashqNatijasi, MashqNatijasi, MashqUrinishi } from './mashq-natijasi';

export interface KunSurati {
  sana: string;
  faolSoniya: number;
  radioSoniya: number;
  savollar: number;
  shugullangan: boolean;
  kirdi: boolean;
  /** hisobBoshi dan oldingi kun — maxrajga ham, suratga ham kirmaydi. */
  kuzatilgan: boolean;
}

export interface DavrSurati {
  kunlar: KunSurati[];
  faolSoniya: number;
  radioSoniya: number;
  platforma: Record<Platforma, number>;
  bolim: { LERNEN: number; OTHER: number };
  kirdi: boolean;
  shugullanganKunlar: number;
  mashq: MashqNatijasi;
}

/**
 * Bir o'quvchining davr surati. Guruh jadvali qatori ham, yon oyna ham shu
 * funksiyadan — ikki ekran bir o'quvchi haqida ikki xil raqam ko'rsatmaydi.
 */
export function davrSurati(
  oyna: DavrOynasi,
  seanslar: SeansSatri[],
  urinishlar: MashqUrinishi[],
): DavrSurati {
  const kunlarTop = new Set(oyna.kunlar);
  const kunYigindi = kunlikYigindi(
    seanslar.filter((s) => kunlarTop.has(s.day)),
  );

  const davrUrinishlari: MashqUrinishi[] = [];
  const urinishKunlari = new Set<string>();
  for (const u of urinishlar) {
    const kun = tashkentDateStr(u.createdAt);
    if (!kunlarTop.has(kun)) continue;
    davrUrinishlari.push(u);
    urinishKunlari.add(kun);
  }
  const mashq = mashqNatijasi(davrUrinishlari);

  const platforma: Record<Platforma, number> = { WEB: 0, ANDROID: 0, IOS: 0 };
  const bolim = { LERNEN: 0, OTHER: 0 };
  let faolSoniya = 0;
  let radioSoniya = 0;
  let kirdi = false;
  let shugullanganKunlar = 0;

  const kunlar = oyna.kunlar.map((sana): KunSurati => {
    const k = kunYigindi.get(sana);
    const kuzatilgan = sana >= oyna.hisobBoshi;
    const shugullangan =
      kuzatilgan &&
      (urinishKunlari.has(sana) ||
        (k?.radioSoniya ?? 0) >= RADIO_KUN_CHEGARASI_S);
    if (k) {
      faolSoniya += k.faolSoniya;
      radioSoniya += k.radioSoniya;
      platforma.WEB += k.platforma.WEB;
      platforma.ANDROID += k.platforma.ANDROID;
      platforma.IOS += k.platforma.IOS;
      bolim.LERNEN += k.bolim.LERNEN;
      bolim.OTHER += k.bolim.OTHER;
      if (k.kirdi) kirdi = true;
    }
    if (shugullangan) shugullanganKunlar += 1;
    return {
      sana,
      faolSoniya: k?.faolSoniya ?? 0,
      radioSoniya: k?.radioSoniya ?? 0,
      savollar: mashq.savolKunlari[sana] ?? 0,
      shugullangan,
      kirdi: k?.kirdi ?? false,
      kuzatilgan,
    };
  });

  return {
    kunlar,
    faolSoniya,
    radioSoniya,
    platforma,
    bolim,
    kirdi,
    shugullanganKunlar,
    mashq,
  };
}
