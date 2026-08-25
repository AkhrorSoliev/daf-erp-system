import type { CefrLevel } from './dataset.types';

/**
 * Grimm Grammar sahifa kodi → GER darajasi.
 *
 * Bu xarita QO'LDA yoziladi va daraja yorliqlashning ikkinchi signali bo'ladi.
 * Bu yerda LLM ishlatilmaydi (spec Q7): qayta hisoblansa bir xil natija
 * chiqishi va har bir qatorni tushuntirib bera olish shart.
 *
 * Ro'yxatda yo'q kod darajaga ta'sir qilmaydi — bilmaslikni taxmin bilan
 * to'ldirish yorliqni yomonlashtiradi.
 */
export const GRAMMAR_LEVEL: Record<string, CefrLevel> = {
  // A1.1 — eng boshlang'ich
  no_01: 'A1.1', no_02: 'A1.1', no_03: 'A1.1',
  det_01: 'A1.1', cas_02: 'A1.1',
  pro_01: 'A1.1', pro_02: 'A1.1',
  v_01: 'A1.1', v_02: 'A1.1', vi_05: 'A1.1', vi_11: 'A1.1',
  con_05: 'A1.1',

  // A1.2 — akkusativ, modal, ajraluvchi fe'l
  cas_03: 'A1.2', det_02: 'A1.2', det_03: 'A1.2',
  pro_03: 'A1.2', vm_01: 'A1.2', vm_02: 'A1.2',
  vsp_01: 'A1.2', vsp_02: 'A1.2',

  // A2.1 — perfekt, dativ
  vcp_01: 'A2.1', vcp_02: 'A2.1', vcp_03: 'A2.1', vcp_04: 'A2.1',
  cas_04: 'A2.1', pro_04: 'A2.1', con_01: 'A2.1',

  // A2.2 — preteritum, ergash gap, sifat qo'shimchasi
  vf_01: 'A2.2', con_03: 'A2.2', con_04: 'A2.2', con_06: 'A2.2',
  adj_01: 'A2.2', adj_02: 'A2.2', adj_03: 'A2.2', adj_05: 'A2.2',

  // B1 — konyunktiv, passiv, relativ, genitiv
  vsub_01: 'B1', vsub_02: 'B1', vsub_03: 'B1', vsub_04: 'B1',
  vpass_01: 'B1', vpass_02: 'B1', vpass_03: 'B1',
  pro_05: 'B1', cas_05: 'B1',
};

/** Bob raqamidan asosiy daraja (spec Q7, birinchi signal). */
export const CHAPTER_LEVEL: Record<number, CefrLevel> = {
  1: 'A1.1', 2: 'A1.1', 3: 'A1.2', 4: 'A1.2', 5: 'A1.2',
  6: 'A2.1', 7: 'A2.1', 8: 'A2.1', 9: 'A2.2', 10: 'A2.2',
};

export const LEVEL_ORDER: CefrLevel[] = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1'];
