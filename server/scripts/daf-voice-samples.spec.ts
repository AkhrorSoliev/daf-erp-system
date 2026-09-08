import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BELGI_CHEGARASI,
  PROBEWOERTER,
  VARIANTEN,
  type SpeechClient,
  dateiYoli,
  faylNomiUchunSlug,
  gesamtZeichenzahl,
  ovozniYukla,
  pruefeBudget,
  sammleAudioUrls,
} from './daf-voice-samples';

// Bu fayl `daf-voice-samples.ts`ni IMPORT qiladi, lekin `main()` faqat
// `require.main === module`da yuguradi (skriptning o'zidagi izohga
// qarang) — shuning uchun shu import HECH QANDAY tarmoq so'rovi yoki
// pullik chaqiruv qilmaydi. Quyidagi testlar ham faqat sof funksiyalarni
// va soxta (fake) `fetch`/klientni sinaydi — haqiqiy `fal.ai`ga chiqilmaydi.

function fetchStub(bytes: string, ok = true): typeof fetch {
  return (async () => ({
    ok,
    status: ok ? 200 : 500,
    arrayBuffer: async () => Buffer.from(bytes, 'utf8'),
  })) as unknown as typeof fetch;
}

/**
 * Har chaqiruvni ID BILAN yozib boradigan soxta klient — kod-ko'rikda
 * topilgan bo'shliqni yopadi: variant→metod bog'lanishi (`sammleAudioUrls`
 * ichidagi ternary) haqiqiy `fal.ai`siz sinalishi kerak, aks holda ikkala
 * shoxcha ham `speech()`ga borib qolsa ham hech qanday test buni ushlamaydi
 * — yugurish "muvaffaqiyatli" tugaydi, faqat uchta bir xil ovoz bilan.
 */
class FakeSpeechClient implements SpeechClient {
  calls: { method: 'speech' | 'speechMitStimme'; text: string; stimme?: string }[] =
    [];

  async speech(text: string): Promise<string> {
    this.calls.push({ method: 'speech', text });
    return `url:speech:${text}`;
  }

  async speechMitStimme(text: string, stimme: string): Promise<string> {
    this.calls.push({ method: 'speechMitStimme', text, stimme });
    return `url:eleven:${stimme}:${text}`;
  }
}

describe('pruefeBudget', () => {
  it("300 belgidan oshsa to`xtaydi", () => {
    expect(() => pruefeBudget(301)).toThrow(/300/);
  });

  it("chegara ichida o`tadi", () => {
    expect(() => pruefeBudget(180)).not.toThrow();
  });

  it("chegaraning aynan o'zida o'tadi (qat'iy oshish emas)", () => {
    expect(() => pruefeBudget(BELGI_CHEGARASI)).not.toThrow();
  });
});

describe('gesamtZeichenzahl', () => {
  it('so`zlar belgi yig`indisini variantlar soniga ko`paytiradi', () => {
    // hallo(5) + tschüss(7) + heißen(6) + Zett(4) + Auf Wiedersehen(16) = 38
    expect(gesamtZeichenzahl(['ab', 'cde'], 2)).toBe(10); // (2+3)*2
  });

  it('haqiqiy PROBEWOERTER va VARIANTEN chegaradan past qoladi', () => {
    // Bu test naqd o'zi himoya: agar kimdir so'z yoki variant qo'shsa va
    // narx chegaradan oshib ketsa, budjet tekshiruvi HAQIQIY sonlar
    // bilan shu yerda ushlaydi — main() ichida emas.
    const gesamt = gesamtZeichenzahl();
    expect(() => pruefeBudget(gesamt)).not.toThrow();
    expect(gesamt).toBeLessThanOrEqual(BELGI_CHEGARASI);
  });

  it('besh so`z va uch variant o`zgarmagan (brifdagi aniq qiymatlar)', () => {
    expect(PROBEWOERTER).toEqual([
      'hallo',
      'tschüss',
      'heißen',
      'Zett',
      'Auf Wiedersehen',
    ]);
    // `stimme` va `label` ham qattiq tekshiriladi — faqat `id`ni solishtirish
    // 'Rachel'ni boshqa ovozga almashtirsa ham testni yashil qoldirar edi,
    // aynan shu qiymat tanlangan ovozni belgilaydigan yagona joy bo'lsa ham.
    expect(VARIANTEN).toEqual([
      { id: 'chatterbox', label: "Chatterbox (mavjud)" },
      {
        id: 'eleven-rachel',
        label: 'ElevenLabs — Rachel (Anna)',
        stimme: 'Rachel',
      },
      {
        id: 'eleven-matilda',
        label: 'ElevenLabs — Matilda (Sabine)',
        stimme: 'Matilda',
      },
    ]);
  });
});

describe('faylNomiUchunSlug', () => {
  it('kichik harfga o`giradi', () => {
    expect(faylNomiUchunSlug('Zett')).toBe('zett');
  });

  it('bo`shliqni tire bilan almashtiradi', () => {
    expect(faylNomiUchunSlug('Auf Wiedersehen')).toBe('auf-wiedersehen');
  });

  it('umlaut va ß saqlanib qoladi', () => {
    expect(faylNomiUchunSlug('tschüss')).toBe('tschüss');
    expect(faylNomiUchunSlug('heißen')).toBe('heißen');
  });
});

describe('dateiYoli', () => {
  it('variant va so`zdan `.mp3` yo`lini yasaydi', () => {
    const yol = dateiYoli('chatterbox', 'hallo');
    expect(yol.endsWith(join('chatterbox', 'hallo.mp3'))).toBe(true);
  });

  it('har variant o`z pastki katalogiga tushadi', () => {
    const a = dateiYoli('eleven-rachel', 'Zett');
    const b = dateiYoli('eleven-matilda', 'Zett');
    expect(a).not.toBe(b);
    expect(a).toContain('eleven-rachel');
    expect(b).toContain('eleven-matilda');
  });
});

describe('ovozniYukla', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'daf-voice-samples-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('soxta fetch orqali baytlarni faylga yozadi (tarmoqqa chiqmaydi)', async () => {
    const faylYoli = join(dir, 'namuna.mp3');
    await ovozniYukla('https://example.invalid/x.mp3', faylYoli, fetchStub('OVOZ'));
    expect(existsSync(faylYoli)).toBe(true);
    expect(readFileSync(faylYoli, 'utf8')).toBe('OVOZ');
  });

  it('javob muvaffaqiyatsiz bo`lsa yiqiladi va fayl yozilmaydi', async () => {
    const faylYoli = join(dir, 'yoq.mp3');
    await expect(
      ovozniYukla('https://example.invalid/x.mp3', faylYoli, fetchStub('', false)),
    ).rejects.toThrow(/500/);
    expect(existsSync(faylYoli)).toBe(false);
  });
});

describe('sammleAudioUrls (variant→metod bog`lanishi)', () => {
  // Kod-ko'rikda topilgan asosiy bo'shliq: `chatterbox`ni ElevenLabs
  // metodiga (yoki teskarisiga) yuborib qo'ysa, hech qanday oldingi test
  // buni ushlamas edi — yugurish baribir "muvaffaqiyatli" ko'rinardi.

  it('chatterbox variantida FAQAT speech() chaqiriladi, speechMitStimme HECH QACHON', async () => {
    const client = new FakeSpeechClient();
    await sammleAudioUrls(client);

    // chatterboxning stimme'i yo'q — shuning uchun uning besh so'zi
    // AYNAN `speech()` chaqiruvlarining o'zi bo'lishi kerak, boshqa hech
    // narsa emas. `speechMitStimme` chatterbox uchun umuman ishlamaydi.
    const speechChaqiruvlari = client.calls.filter((c) => c.method === 'speech');
    expect(speechChaqiruvlari).toHaveLength(PROBEWOERTER.length);
    expect(speechChaqiruvlari.map((c) => c.text).sort()).toEqual(
      [...PROBEWOERTER].sort(),
    );
  });

  it('eleven-rachel HAR so`z uchun speechMitStimme(..., "Rachel") chaqiradi', async () => {
    const client = new FakeSpeechClient();
    await sammleAudioUrls(client);
    const rachelChaqiruvlari = client.calls.filter(
      (c) => c.method === 'speechMitStimme' && c.stimme === 'Rachel',
    );
    expect(rachelChaqiruvlari).toHaveLength(PROBEWOERTER.length);
    expect(rachelChaqiruvlari.map((c) => c.text).sort()).toEqual(
      [...PROBEWOERTER].sort(),
    );
  });

  it('eleven-matilda HAR so`z uchun speechMitStimme(..., "Matilda") chaqiradi', async () => {
    const client = new FakeSpeechClient();
    await sammleAudioUrls(client);
    const matildaChaqiruvlari = client.calls.filter(
      (c) => c.method === 'speechMitStimme' && c.stimme === 'Matilda',
    );
    expect(matildaChaqiruvlari).toHaveLength(PROBEWOERTER.length);
    expect(matildaChaqiruvlari.map((c) => c.text).sort()).toEqual(
      [...PROBEWOERTER].sort(),
    );
  });

  it('besh so`z HAR uch variant orqali o`tadi (3x5 = 15 chaqiruv, boshqa son emas)', async () => {
    const client = new FakeSpeechClient();
    const natijalar = await sammleAudioUrls(client);
    expect(client.calls).toHaveLength(VARIANTEN.length * PROBEWOERTER.length);
    expect(natijalar).toHaveLength(VARIANTEN.length * PROBEWOERTER.length);
    for (const variant of VARIANTEN) {
      const shuVariantUchun = natijalar.filter((n) => n.variant.id === variant.id);
      expect(shuVariantUchun.map((n) => n.wort).sort()).toEqual(
        [...PROBEWOERTER].sort(),
      );
    }
  });

  it('xato variant ID va so`z bilan boyitilib qayta tashlanadi', async () => {
    const buzuqKlient: SpeechClient = {
      speech: async () => {
        throw new Error('tarmoq xatosi');
      },
      speechMitStimme: async () => {
        throw new Error('tarmoq xatosi');
      },
    };
    await expect(sammleAudioUrls(buzuqKlient)).rejects.toThrow(
      /"hallo".*"chatterbox"/,
    );
  });
});
