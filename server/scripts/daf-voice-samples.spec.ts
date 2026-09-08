import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BELGI_CHEGARASI,
  PROBEWOERTER,
  VARIANTEN,
  dateiYoli,
  faylNomiUchunSlug,
  gesamtZeichenzahl,
  ovozniYukla,
  pruefeBudget,
} from './daf-voice-samples';

// Bu fayl `daf-voice-samples.ts`ni IMPORT qiladi, lekin `main()` faqat
// `require.main === module`da yuguradi (skriptning o'zidagi izohga
// qarang) — shuning uchun shu import HECH QANDAY tarmoq so'rovi yoki
// pullik chaqiruv qilmaydi. Quyidagi testlar ham faqat sof funksiyalarni
// va soxta (fake) `fetch`ni sinaydi — haqiqiy `fal.ai`ga chiqilmaydi.

function fetchStub(bytes: string, ok = true): typeof fetch {
  return (async () => ({
    ok,
    status: ok ? 200 : 500,
    arrayBuffer: async () => Buffer.from(bytes, 'utf8'),
  })) as unknown as typeof fetch;
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
    expect(VARIANTEN.map((v) => v.id)).toEqual([
      'chatterbox',
      'eleven-rachel',
      'eleven-matilda',
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
