import {
  FalAblehnungError,
  FalClient,
  OVOZ_TEZLIGI_MAX,
  OVOZ_TEZLIGI_MIN,
} from './fal-client';

function fetchStub(body: unknown, ok = true): typeof fetch {
  return (async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('FalClient.image', () => {
  it('birinchi rasmning manzilini qaytaradi', async () => {
    const c = new FalClient(
      'k',
      fetchStub({ images: [{ url: 'https://x/a.jpg' }] }),
    );
    expect(await c.image('p', 1)).toBe('https://x/a.jpg');
  });

  // Jimgina `undefined` qaytarish keyinroq R2 ga bo'sh kalit yozardi.
  it('rasm qaytmasa yiqiladi', async () => {
    const c = new FalClient('k', fetchStub({ images: [] }));
    await expect(c.image('p', 1)).rejects.toThrow(/rasm/i);
  });

  it('xato javobda holat kodini xabarga qo`yadi', async () => {
    const c = new FalClient('k', fetchStub({ error: 'nope' }, false));
    await expect(c.image('p', 1)).rejects.toThrow(/500/);
  });
});

describe('FalClient.speech', () => {
  it('ovoz manzilini qaytaradi', async () => {
    const c = new FalClient(
      'k',
      fetchStub({ audio: { url: 'https://x/a.mp3' } }),
    );
    expect(await c.speech('Hallo')).toBe('https://x/a.mp3');
  });

  it('ovoz qaytmasa yiqiladi', async () => {
    const c = new FalClient('k', fetchStub({}));
    await expect(c.speech('Hallo')).rejects.toThrow(/ovoz/i);
  });
});

describe('FalClient.speechMitStimme', () => {
  it('ElevenLabs modelini ovoz nomi bilan chaqiradi', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({ audio: { url: 'https://x/y.mp3' } }),
    })) as any;
    const c = new FalClient('kalit', fetchFn);
    const url = await c.speechMitStimme('hallo', 'Rachel', 0.85);
    expect(url).toBe('https://x/y.mp3');
    const [manzil, opts] = fetchFn.mock.calls[0];
    expect(manzil).toContain('elevenlabs');
    const body = JSON.parse(opts.body);
    expect(body.text).toBe('hallo');
    expect(body.voice).toBe('Rachel');
  });

  // CEO namunalarni eshitib Rachel + 0.85 tanladi — agar `speed` so'rov
  // tanasiga yetib bormasa, tanlov jimgina bekor bo'ladi va fal.ai
  // standart (1.0) tezlikda gapiradi. Bu test aynan shu yetib borishni
  // qadaydi: `speechMitStimme` `speed` argumentini butunlay e'tiborsiz
  // qoldirib qo'ysa (yoki so'rov tanasiga qo'shmasa) qizil bo'ladi.
  it('speed maydonini so`rov tanasiga ANIQ yuborilgan qiymat bilan qo`shadi', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({ audio: { url: 'https://x/y.mp3' } }),
    })) as any;
    const c = new FalClient('kalit', fetchFn);
    await c.speechMitStimme('hallo', 'Rachel', 0.85);
    const [, opts] = fetchFn.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.speed).toBe(0.85);
  });

  // Model 0.7–1.2 oralig'idan tashqari qiymatni rad etadi — lekin bu
  // tekshiruv `fal.ai`ga yuborishdan OLDIN, mahalliy bo'lishi kerak:
  // 30 ta pullik so'rovdan keyin rad javobi olishdan ko'ra, birinchi
  // so'zdayoq (chaqiruvsiz) to'xtash yaxshiroq. Agar tekshiruv olib
  // tashlansa (yoki `run()`dan keyinga ko'chirilsa) bu test `fetchFn`
  // chaqirilganini ko'rib qizil bo'ladi.
  it('oraliqdan tashqari tezlikni fal.ai`ga yuborishdan OLDIN rad etadi', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({ audio: { url: 'https://x/y.mp3' } }),
    })) as any;
    const c = new FalClient('kalit', fetchFn);
    await expect(c.speechMitStimme('hallo', 'Rachel', 0.5)).rejects.toThrow(
      /0\.7.*1\.2/,
    );
    await expect(c.speechMitStimme('hallo', 'Rachel', 1.5)).rejects.toThrow(
      /0\.7.*1\.2/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('oraliqning ikkala chetida ham o`tadi (qat`iy oshish emas)', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({ audio: { url: 'https://x/y.mp3' } }),
    })) as any;
    const c = new FalClient('kalit', fetchFn);
    await expect(
      c.speechMitStimme('hallo', 'Rachel', OVOZ_TEZLIGI_MIN),
    ).resolves.toBe('https://x/y.mp3');
    await expect(
      c.speechMitStimme('hallo', 'Rachel', OVOZ_TEZLIGI_MAX),
    ).resolves.toBe('https://x/y.mp3');
  });

  // Fix 2: `language_code` YO'Q bo'lsa ElevenLabs (inglizcha o'qitilgan
  // ovoz) matnni inglizcha fonetikaga moslab o'qishi mumkin — bu audio
  // TALAFFUZ NAMUNASI bo'lgani uchun jim taxmin emas, qat'iy majburlash
  // kerak (`fal-client.ts`dagi izoh). Namuna skripti chaqiruvi bilan
  // BIR XIL metod, shuning uchun namunani ko'rish payti ham shu til
  // bilan bo'lishi shart.
  it('language_code=de ni QAT`IY yuboradi — namunadan oldin ham', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({ audio: { url: 'https://x/y.mp3' } }),
    })) as any;
    const c = new FalClient('kalit', fetchFn);
    await c.speechMitStimme('tschüss', 'Matilda', 1.0);
    const [, opts] = fetchFn.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.language_code).toBe('de');
  });

  it('mavjud speech() Chatterbox`da qoladi', async () => {
    // Namunada uchinchi variant sifatida kerak — o'zgartirilmaydi.
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({ audio: { url: 'https://x/c.mp3' } }),
    })) as any;
    await new FalClient('kalit', fetchFn).speech('hallo');
    expect(fetchFn.mock.calls[0][0]).toContain('chatterbox');
  });
});

describe('FalClient.dialog', () => {
  it('butun suhbatni bitta so`rovda yuboradi, de tili va stability bilan', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fetchFn = (async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ audio: { url: 'https://x/d.mp3' }, seed: 1 }),
        text: async () => '',
      };
    }) as unknown as typeof fetch;
    const c = new FalClient('k', fetchFn);
    const url = await c.dialog([
      { voice: 'Aria', text: 'Ist das deine Schwester?' },
      { voice: 'Liam', text: 'Nein.' },
    ]);
    expect(url).toBe('https://x/d.mp3');
    expect(calls[0].url).toBe(
      'https://fal.run/fal-ai/elevenlabs/text-to-dialogue/eleven-v3',
    );
    expect(calls[0].body).toEqual({
      inputs: [
        { voice: 'Aria', text: 'Ist das deine Schwester?' },
        { voice: 'Liam', text: 'Nein.' },
      ],
      language_code: 'de',
      stability: 0.5,
    });
  });

  it('audio qaytmasa yiqiladi', async () => {
    const c = new FalClient('k', fetchStub({ seed: 1 }));
    await expect(c.dialog([{ voice: 'Aria', text: 'x' }])).rejects.toThrow(
      /suhbat/i,
    );
  });
});

// Word audio: Inworld "Johanna (de)" since 2026-09-25. The CEO heard two
// multilingual voices (ElevenLabs Rachel, then Gemini) read German words
// that are also English words (Name, Land, wer) with English sounds, and
// approved Inworld's German voice after hearing 33 such words.
describe('FalClient.speechInworld', () => {
  it('calls the Inworld endpoint with the bare word and the voice', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fetchFn = (async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ audio: { url: 'https://x/i.wav' } }),
        text: async () => '',
      };
    }) as unknown as typeof fetch;
    const url = await new FalClient('k', fetchFn).speechInworld(
      'Name',
      'Johanna (de)',
    );
    expect(url).toBe('https://x/i.wav');
    expect(calls[0].url).toBe('https://fal.run/fal-ai/inworld-tts');
    expect(calls[0].body).toEqual({ text: 'Name', voice: 'Johanna (de)' });
  });

  it('fails when no audio comes back', async () => {
    const c = new FalClient('k', fetchStub({}));
    await expect(c.speechInworld('Name', 'Johanna (de)')).rejects.toThrow(
      /ovoz/i,
    );
  });
});

// Gemini's content checker refused plain words at random ("dann" twice,
// "zwischen" once). Any model call can meet it, so run() gives it its own
// error type and the script retries exactly this case.
describe('FalClient content-checker refusal', () => {
  it('turns 422 content_policy_violation into FalAblehnungError', async () => {
    const fetchFn = (async () => ({
      ok: false,
      status: 422,
      json: async () => ({}),
      text: async () =>
        '{"detail":[{"msg":"flagged by a content checker","type":"content_policy_violation"}]}',
    })) as unknown as typeof fetch;
    const p = new FalClient('k', fetchFn).speechInworld('dann', 'Johanna (de)');
    await expect(p).rejects.toBeInstanceOf(FalAblehnungError);
  });

  it('keeps any other 422 a plain error, so a wrong request is not retried', async () => {
    const fetchFn = (async () => ({
      ok: false,
      status: 422,
      json: async () => ({}),
      text: async () =>
        '{"detail":[{"msg":"field required","type":"missing"}]}',
    })) as unknown as typeof fetch;
    await expect(
      new FalClient('k', fetchFn).speechInworld('dann', 'Johanna (de)'),
    ).rejects.toThrow(/422/);
    await expect(
      new FalClient('k', fetchFn).speechInworld('dann', 'Johanna (de)'),
    ).rejects.not.toBeInstanceOf(FalAblehnungError);
  });
});
