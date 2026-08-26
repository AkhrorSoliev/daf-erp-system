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
  // A1.1 — asosiy: rod, kishilik olmoshi, sein/haben, W-savollar, vaqt va sana
  no_02: 'A1.1',   // nouns gender
  v_01: 'A1.1',    // verbs overview
  vi_05: 'A1.1',   // haben
  vi_11: 'A1.1',   // sein
  pro_02: 'A1.1',  // nominative pronouns
  con_05: 'A1.1',  // interrogatives
  cas_04: 'A1.1',  // telling time
  cas_05: 'A1.1',  // days of the week
  cas_06: 'A1.1',  // months and seasons

  // A1.2 — akkusativ, egalik, o'zak o'zgaruvchi fe'llar, modal, buyruq
  cas_03: 'A1.2',  // accusative case
  det_04: 'A1.2',  // possessive determiners nominative
  vm_01: 'A1.2',   // modal verbs - present tense
  con_03: 'A1.2',  // coordinating conjunctions
  vimp_01: 'A1.2', // imperative
  vi_01: 'A1.2',   // essen
  vi_02: 'A1.2',   // fahren
  vi_03: 'A1.2',   // geben
  vi_04: 'A1.2',   // gefallen
  vi_06: 'A1.2',   // laufen
  vi_08: 'A1.2',   // nehmen
  vi_09: 'A1.2',   // schlafen
  vi_10: 'A1.2',   // sehen
  vi_13: 'A1.2',   // tragen
  vsp_04: 'A1.2',  // simple past - haben (`hatte` erta o'rgatiladi)
  vsp_05: 'A1.2',  // simple past - sein (`war` erta o'rgatiladi)

  // A2.1 — Perfekt, dativ, refleksiv
  vcp_01: 'A2.1',  // conversational past
  vcp_02: 'A2.1',  // conversational past - regular verbs
  vcp_03: 'A2.1',  // conversational past of irregular verbs with haben
  vcp_04: 'A2.1',  // conversational past of irregular verbs with sein
  vcp_05: 'A2.1',  // conversational past - mixed verbs
  vcp_06: 'A2.1',  // conversational past of -ieren verbs
  vcp_07: 'A2.1',  // conversational past - separable prefix verbs
  vcp_08: 'A2.1',  // conversational past - inseparable prefix verbs
  cas_07: 'A2.1',  // dative
  vrf_01: 'A2.1',  // reflexive verbs
  vi_15: 'A2.1',   // wissen (also vs. kennen)

  // A2.2 — Prateritum, ergash gap, qiyoslash, ravish, infinitiv qurilma
  vsp_01: 'A2.2',  // simple past regular verbs
  con_04: 'A2.2',  // subordinating conjunctions
  adj_05: 'A2.2',  // comparative and superlative
  adv_01: 'A2.2',  // adverbs of time, frequency, quantity, intensity
  adv_02: 'A2.2',  // adverbs of manner and place
  adv_03: 'A2.2',  // adverbs of narration
  vinf_01: 'A2.2', // infinitive constructions
  vm_02: 'A2.2',   // modal verbs - past tense
  mis_02: 'A2.2',  // word formation

  // B1 — konyunktiv
  vsub_02: 'B1',   // present subjunctive
};

/** Bob raqamidan asosiy daraja (spec Q7, birinchi signal). */
export const CHAPTER_LEVEL: Record<number, CefrLevel> = {
  1: 'A1.1', 2: 'A1.1', 3: 'A1.2', 4: 'A1.2', 5: 'A1.2',
  6: 'A2.1', 7: 'A2.1', 8: 'A2.1', 9: 'A2.2', 10: 'A2.2',
};

export const LEVEL_ORDER: CefrLevel[] = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1'];
