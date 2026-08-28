/**
 * Tarjima uchun modelga bo'lgan YAGONA talab.
 *
 * Interfeys ataylab tor: matn kiradi, matn chiqadi. Sababi — tarjima bir
 * martalik ish, va uni qaysi vendor bajarishi qaror emas, tafsilot.
 * Kengroq interfeys (xabarlar tarixi, vositalar, oqim) shu tafsilotni
 * arxitekturaga aylantirardi.
 */
export interface TranslateModel {
  /** So'rovga javob matnini qaytaradi. */
  complete(prompt: string): Promise<string>;
  /** Hisobotda ko'rsatiladigan nom. */
  readonly name: string;
}

/**
 * OpenAI'ning `chat/completions` ga oddiy `fetch` bilan murojaat.
 *
 * Yangi paket qo'shilmadi: bitta so'nggi nuqta uchun SDK olib kirish
 * bog'liqliklar yuzasini kengaytiradi, va bu kod faqat skriptdan
 * chaqiriladi — server ish vaqtida emas.
 */
export class OpenAiTranslateModel implements TranslateModel {
  readonly name: string;

  constructor(
    private readonly apiKey: string,
    model = 'gpt-4o-mini',
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.name = model;
  }

  async complete(prompt: string): Promise<string> {
    const res = await this.fetchFn(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.name,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`Model javob bermadi (${res.status})`);
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new Error("Model javobida matn yo'q");
    }
    return text;
  }
}
