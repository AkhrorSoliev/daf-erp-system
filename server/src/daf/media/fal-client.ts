const IMAGE_MODEL = 'fal-ai/flux/schnell';
const TTS_MODEL = 'fal-ai/chatterbox/text-to-speech/multilingual';
const TTS_ELEVEN_MODEL = 'fal-ai/elevenlabs/tts/turbo-v2.5';
const TTS_INWORLD_MODEL = 'fal-ai/inworld-tts';
const SFX_MODEL = 'fal-ai/elevenlabs/sound-effects/v2';
/**
 * The course dialog model (`dialog-audio.ts` pins it). Gemini 3.8 since
 * 2026-10-11 (ADR-0085): the CEO compared it with 3.1 on u05-d1 and chose
 * it, with one voice per character. It answers with WAV (`audio-format.ts`).
 */
export const TTS_GEMINI_MODEL = 'google/gemini-3.8-flash-tts';

/**
 * The dialog model from 2026-09-26 to 2026-10-11. Units are re-voiced on
 * 3.8 one at a time; until then their 3.1 recordings stay valid.
 */
export const FRUEHERES_GEMINI_MODEL = 'fal-ai/gemini-3.1-flash-tts';

/** "[tone] text" — the tone tag `geminiDialog` puts before a line. */
const TON_TAG = /^\[([^\]]+)\]\s*/;

/**
 * One whole dialog for Gemini's dialogue mode. `prompt` has one line per
 * turn, each prefixed with a `speakerId` ("Anna: …"); `styleInstructions`
 * directs the delivery and is not spoken.
 */
export interface GeminiDialog {
  prompt: string;
  speakers: Array<{ speakerId: string; voice: string }>;
  styleInstructions: string;
}

/**
 * The model's content checker refused the text (HTTP 422 with
 * `content_policy_violation`). Gemini TTS did this at random to plain
 * German words on 2026-09-25: it refused "dann" twice and "zwischen" once,
 * then accepted "zwischen" on the next identical request. Any model behind
 * fal can answer this way, so `run()` reports it as its own type and the
 * word script retries exactly this case and nothing else.
 */
export class FalAblehnungError extends Error {}

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
      const matn = await res.text();
      if (res.status === 422 && matn.includes('content_policy_violation')) {
        throw new FalAblehnungError(
          `fal.ai matnni rad etdi (422, content_policy_violation): ${matn}`,
        );
      }
      throw new Error(`fal.ai javob bermadi (${res.status}): ${matn}`);
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

  /**
   * German word audio: Inworld TTS with its German voice "Johanna (de)",
   * the course word voice since 2026-09-25. Two multilingual voices before
   * it (ElevenLabs Rachel, then Gemini) read German words that are also
   * English words (Name, Land, wer) with English sounds, because one word
   * alone tells a multilingual model nothing about its language. The CEO
   * heard 33 such words in this voice and approved it.
   *
   * Only the bare word is sent, so the billed characters are the word
   * itself. The model has no speed setting; the caller slows the clip
   * locally (`audio-tempo.ts`). The answer is a WAV file.
   */
  async speechInworld(text: string, stimme: string): Promise<string> {
    const out = await this.run(TTS_INWORLD_MODEL, { text, voice: stimme });
    const url = out?.audio?.url;
    if (typeof url !== 'string') throw new Error('fal.ai ovoz qaytarmadi');
    return url;
  }

  /**
   * A course dialog in Gemini's dialogue mode, the model the CEO chose for
   * every dialog on 2026-09-26: all speakers in one request, so each turn
   * answers the one before it. German comes from the text and the scene (3.8
   * has no language field); single words go to Inworld instead
   * (`speechInworld`), because a lone word gives a multilingual model no
   * language to go by, while a dialog does.
   *
   * 3.8 takes ordered turns instead of one prompt: each "Speaker: [tone]
   * text" line of `prompt` becomes a turn, its tone that turn's style.
   */
  async dialogGemini(dialog: GeminiDialog): Promise<string> {
    const turns = dialog.prompt.split('\n').map((zeile) => {
      const i = zeile.indexOf(': ');
      if (i <= 0) {
        throw new Error(`gapiruvchi va matnga ajratib bo'lmadi: «${zeile}»`);
      }
      const rest = zeile.slice(i + 2);
      const ton = TON_TAG.exec(rest);
      return {
        speaker_id: zeile.slice(0, i),
        text: ton ? rest.slice(ton[0].length) : rest,
        ...(ton ? { style_instructions: ton[1] } : {}),
      };
    });
    const out = await this.run(TTS_GEMINI_MODEL, {
      speakers: dialog.speakers.map((s) => ({
        speaker_id: s.speakerId,
        voice: s.voice,
      })),
      turns,
      style_instructions: dialog.styleInstructions,
    });
    const url = out?.audio?.url;
    if (typeof url !== 'string') throw new Error('fal.ai suhbat qaytarmadi');
    return url;
  }

  /**
   * One dialog line voiced alone, for a speaker beyond the two that
   * Gemini's dialogue mode takes (`mehrstimmig.ts`). Same model, language
   * and scene as the dialogue request, so the voice matches.
   */
  async sprecheGemini(
    prompt: string,
    voice: string,
    styleInstructions: string,
  ): Promise<string> {
    const ton = TON_TAG.exec(prompt);
    const out = await this.run(TTS_GEMINI_MODEL, {
      prompt: ton ? prompt.slice(ton[0].length) : prompt,
      voice,
      style_instructions: ton
        ? `${styleInstructions} Tone of this line: ${ton[1]}.`
        : styleInstructions,
    });
    const url = out?.audio?.url;
    if (typeof url !== 'string') throw new Error('fal.ai ovoz qaytarmadi');
    return url;
  }

  /**
   * One sound effect for a realistic dialog (a door, a fridge, a room tone).
   * `loop` makes a room tone that repeats without a seam. A prompt influence
   * of 0.5 keeps the sound close to what was asked for.
   */
  async geraeusch(text: string, sek: number, loop: boolean): Promise<string> {
    const out = await this.run(SFX_MODEL, {
      text,
      duration_seconds: sek,
      loop,
      prompt_influence: 0.5,
      output_format: 'mp3_44100_128',
    });
    const url = out?.audio?.url;
    if (typeof url !== 'string') throw new Error('fal.ai effekt qaytarmadi');
    return url;
  }
}
