import { DafMediaOverviewService } from './daf-media-overview.service';
import type { ConfigService } from '@nestjs/config';

/**
 * Xizmat haqiqiy `content/daf` fayllarini o'qiydi — soxta ma'lumot emas.
 * Sabab: bu yerda sinaladigan yagona xavf faylning o'zi topilmasligi yoki
 * shakli o'zgarib ketishi. Soxta fayl bilan test o'sha ikkovini ham
 * o'tkazib yuborardi.
 */
describe('DafMediaOverviewService', () => {
  const config = {
    get: (k: string) => (k === 'R2_PUBLIC_URL' ? 'https://media.example.com' : undefined),
  } as unknown as ConfigService;
  const service = new DafMediaOverviewService(config);

  it('kontent fayllarini topadi', () => {
    expect(service.overview().vorhanden).toBe(true);
  });

  it('har obrazga to‘liq R2 havolasini yasaydi', () => {
    const { personas } = service.overview();
    expect(personas.length).toBeGreaterThan(0);
    for (const p of personas) {
      expect(p.portraitUrl).toMatch(
        /^https:\/\/media\.example\.com\/daf\/persona\/portrait\/.+\.jpg$/,
      );
      expect(p.probeUrl).toMatch(
        /^https:\/\/media\.example\.com\/daf\/persona\/voice\/.+\.mp3$/,
      );
    }
  });

  it('R2 sozlanmagan bo‘lsa havola o‘rniga null qaytaradi', () => {
    const bare = new DafMediaOverviewService({
      get: () => undefined,
    } as unknown as ConfigService);
    const p = bare.overview().personas[0];
    expect(p.portraitUrl).toBeNull();
    expect(p.probeUrl).toBeNull();
  });

  it('aktivlarni turi va bo‘limi bo‘yicha yig‘adi, jami ikkalasida ham mos', () => {
    const { nachArt, nachBereich, summe, alle } = service.overview();
    expect(nachArt.length).toBeGreaterThan(0);
    expect(nachBereich.length).toBeGreaterThan(0);
    for (const g of [nachArt, nachBereich]) {
      expect(summe.anzahl).toBe(g.reduce((s, a) => s + a.anzahl, 0));
      expect(summe.bytes).toBe(g.reduce((s, a) => s + a.bytes, 0));
    }
    expect(alle.length).toBe(summe.anzahl);
  });

  it('obrazlardan tashqari kontentni ham qamraydi', () => {
    // Manifest qo'lda yozilganda A1 audiosi va B1 epizodi tushib qolgan edi.
    // Bu tekshiruv o'sha xatoni qaytib kelishiga yo'l qo'ymaydi.
    const { nachBereich } = service.overview();
    const bereiche = nachBereich.map((b) => b.bereich);
    expect(bereiche).toContain('persona');
    expect(bereiche).toContain('einheit');
  });

  it('har aktivga sarlavha va havola beradi', () => {
    for (const a of service.overview().alle) {
      expect(a.titel.trim().length).toBeGreaterThan(0);
      expect(a.url).toContain('https://media.example.com/');
    }
  });

  it('obraz ovozi qaysi tizimda ekanini bildiradi', () => {
    const { personas } = service.overview();
    // Aralash tizim dialogda taqiqlangani uchun bu bayroq sahifada
    // ko'rsatiladi — u yo'qolsa foydalanuvchi buzuq dialog yasaydi.
    for (const p of personas) {
      expect(typeof p.stimme.dialogfaehig).toBe('boolean');
    }
  });
});
