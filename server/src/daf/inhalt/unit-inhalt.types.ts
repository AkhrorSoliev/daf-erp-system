/**
 * Unitning matni — bitta unitning hamma yozma materiali.
 *
 * Har fayl bitta narsani saqlaydi va alohida tekshiriladi. Bitta katta
 * `u01.json` o'rniga beshta fayl: ular alohida yaratiladi, alohida
 * ko'rikdan o'tadi, va biri qayta yasalganda qolganlari tegilmaydi.
 */

/** Ekranda ko'rinadigan va aytiladigan matn ajratilgan qator. */
export interface Sprechbar {
  de: string;
  /**
   * ElevenLabs'ga yuboriladigan matn.
   *
   * Yakka harf va raqamni TTS INGLIZCHA o'qiydi (`0176` → «Zero…»),
   * shuning uchun ular uchun aytilishi qo'lda yoziladi:
   * `null eins sieben sechs`.
   */
  tts?: string;
  uz: string;
}

export interface Wort extends Sprechbar {
  /** Barqaror kalit: `u01-s1-hallo`. Seed shu bo'yicha yangilaydi. */
  sourceId: string;
  section: string;
  artikel?: string;
  plural?: string;
  /** `true` — mashqda so'raladi; `false` — faqat matnda uchraydi. */
  core: boolean;
  order: number;
}

export interface WoerterFile {
  unit: string;
  woerter: Wort[];
}
