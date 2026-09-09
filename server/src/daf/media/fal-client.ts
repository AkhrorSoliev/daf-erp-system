const IMAGE_MODEL = 'fal-ai/flux/schnell';
const TTS_MODEL = 'fal-ai/chatterbox/text-to-speech/multilingual';
const TTS_ELEVEN_MODEL = 'fal-ai/elevenlabs/tts/turbo-v2.5';

/**
 * `fal-ai/elevenlabs/tts/turbo-v2.5` hujjatida qat'iy belgilangan `speed`
 * oralig'i — bundan tashqari qiymatni model o'zi rad etadi. Bu yerda
 * konstanta qilib chiqarilgan, chunki chaqiruvchi tomon (skriptlar) HAM
 * yuborishdan OLDIN shu bilan tekshiradi — 30-so'zdan keyin fal.ai'dan
 * rad javobi olishdan ko'ra, birinchi so'zdayoq mahalliy xato yaxshiroq.
 */
export const OVOZ_TEZLIGI_MIN = 0.7;
export const OVOZ_TEZLIGI_MAX = 1.2;

/**
 * fal.ai ga yagona kirish nuqtasi.
 *
 * Interfeys ataylab tor — ikkita metod, ikkalasi ham manzil qaytaradi.
 * Baytlarni bu klass ko'chirmaydi: buni `R2Uploader.uploadMissing()`
 * allaqachon qiladi, u `sourceUrl` dan o'qiydi.
 */
export class FalClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async run(model: string, input: unknown): Promise<any> {
    const res = await this.fetchFn(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        authorization: `Key ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(
        `fal.ai javob bermadi (${res.status}): ${await res.text()}`,
      );
    }
    return res.json();
  }

  async image(prompt: string, seed: number): Promise<string> {
    const out = await this.run(IMAGE_MODEL, {
      prompt,
      image_size: 'square_hd',
      num_images: 1,
      output_format: 'jpeg',
      seed,
    });
    const url = out?.images?.[0]?.url;
    if (typeof url !== 'string') throw new Error('fal.ai rasm qaytarmadi');
    return url;
  }

  async speech(text: string): Promise<string> {
    const out = await this.run(TTS_MODEL, { text, language: 'de' });
    const url = out?.audio?.url;
    if (typeof url !== 'string') throw new Error('fal.ai ovoz qaytarmadi');
    return url;
  }

  /**
   * ElevenLabs ovozi bilan nutq.
   *
   * NEGA MAVJUD `speech()` YETMAYDI: u Chatterbox'ga qattiq bog'langan
   * va ovoz tanlash parametri yo'q. `personas.json` esa ElevenLabs
   * ovozlarini yozib qo'ygan (Rachel, Matilda, ...). Ikkalasi ham
   * namunada solishtiruv tomoni sifatida kerak, shuning uchun
   * `speech()` O'ZGARTIRILMAYDI — yangisi yoniga qo'shiladi.
   *
   * `language_code: 'de'` QAT'IY yuboriladi, TAXMIN QILINMAYDI: bu audio
   * boshlang'ich uchun TALAFFUZ NAMUNASI (`daf-voice-samples.ts`dagi
   * izohga qarang), `personas.json`dagi ElevenLabs ovozlari esa
   * INGLIZCHA o'qitilgan — til kodisiz model matnni inglizcha
   * fonetikaga moslab o'qishi mumkin (masalan `tschüss` yoki harf nomi
   * `Zett`), bu esa noto'g'ri talaffuzni "namunaviy" qilib ko'rsatardi.
   * Chatterbox yo'li (`speech()`) buni allaqachon qiladi (`language:
   * 'de'`) — bu yerda parametr nomi boshqa (`language_code`), chunki
   * ElevenLabs modeli shu nomni kutadi.
   *
   * Bu sozlama NAMUNA (`daf-voice-samples.ts`) chaqiruvidan OLDIN
   * kiritiladi, keyin emas: namunani eshitib CEO tanlagan ovoz aynan
   * shu til majburlash bilan tanlangan bo'lishi kerak — keyin qo'shilsa
   * tanlov haqiqiy ishlab chiqarish ovozini aks ettirmay qolardi.
   *
   * `speed` ATAYLAB MAJBURIY parametr, ixtiyoriy-standartli emas: CEO
   * namunalarni eshitib aynan Rachel + 0.85 tanladi, va standart qiymat
   * (masalan `1.0`) qo'yilgan bo'lganda uni yozishni unutish xuddi shu
   * tanlovni sukut bo'yicha bekor qilardi — jimgina, xatosiz ko'rinib.
   * Majburiy parametr bu unutishni COMPILE VAQTIDA xatoga aylantiradi:
   * chaqiruvchi tomon (`daf-gen-audio.ts`, `daf-voice-samples.ts`)
   * tezlikni ANIQ aytishga majbur, aks holda TypeScript qabul qilmaydi.
   *
   * Oraliq (`OVOZ_TEZLIGI_MIN`–`OVOZ_TEZLIGI_MAX`) `fal.ai`ga
   * yuborishdan OLDIN shu yerda tekshiriladi — model buni baribir rad
   * etardi, lekin 53 so'zdan 31-chisida (pullik chaqiruvlardan keyin)
   * emas, birinchi chaqiruvdayoq.
   */
  async speechMitStimme(
    text: string,
    stimme: string,
    speed: number,
  ): Promise<string> {
    if (speed < OVOZ_TEZLIGI_MIN || speed > OVOZ_TEZLIGI_MAX) {
      throw new Error(
        `Ovoz tezligi (${speed}) ruxsat etilgan oraliqdan tashqarida: ` +
          `${OVOZ_TEZLIGI_MIN}–${OVOZ_TEZLIGI_MAX}. Chaqiruv TO'XTATILDI, ` +
          "hech narsa fal.ai'ga yuborilmadi.",
      );
    }
    const out = await this.run(TTS_ELEVEN_MODEL, {
      text,
      voice: stimme,
      language_code: 'de',
      speed,
    });
    const url = out?.audio?.url;
    if (typeof url !== 'string') throw new Error('fal.ai ovoz qaytarmadi');
    return url;
  }
}
