const IMAGE_MODEL = 'fal-ai/flux/schnell';
const TTS_MODEL = 'fal-ai/chatterbox/text-to-speech/multilingual';

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
}
