import { FalClient, OVOZ_TEZLIGI_MAX, OVOZ_TEZLIGI_MIN } from './fal-client';

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
