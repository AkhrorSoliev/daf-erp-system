import * as fs from 'fs';
import * as path from 'path';
import { VORSCHAU_BAUER } from './daf-media-fragen.service';

/**
 * Client `FrageFormat`ni import QILA OLMAYDI — server va client alohida
 * TypeScript loyihalari (`media-fragen-types.ts`dagi izoh). Shuning uchun
 * `client/src/components/media/media-fragen-types.ts` o'z ittifoqini QO'LDA
 * qaytadan e'lon qiladi. Bu ikkalasini bog'laydigan compile-time tekshiruv
 * YO'Q: server tomonda yangi format qo'shilib `VORSCHAU_BAUER`ga (bu fayldagi
 * `Record<FrageFormat, ...>`) yozilmasa server build yiqiladi — YAXSHI —
 * lekin CLIENT build BUTUNLAY BEXABAR qoladi, chunki mijozning o'z ittifoqi
 * hech narsaga bog'lanmagan. Natija: `vorschauShakli(format)` `undefined`
 * qaytaradi, `FORMAT_NOMLARI[format]` ham `undefined` — sarlavhasiz bo'sh
 * qator (qarang `media-fragen-panel.tsx`).
 *
 * Bu test o'sha bog'lanishni ISHLAB BERADI — lekin QO'LDA YOZILGAN UCHINCHI
 * ro'yxat SIFATIDA EMAS (bu xuddi shu muammoni boshqa shaklda takrorlagan
 * bo'lardi — brief: "hand-maintained duplicate list would be the same
 * problem wearing a different hat"). Ikkala tomon ham haqiqatda formatlar
 * qo'shilganda o'zgaradigan MANBADAN o'qiladi:
 *   - server: `Object.keys(VORSCHAU_BAUER)` — `VORSCHAU_BAUER`ning turi
 *     `Record<FrageFormat, ...>` bo'lgani uchun bu ro'yxat HAR DOIM to'liq
 *     va aniq (ortiqcha yoki kam kalit bilan `tsc` yiqiladi) — qarang shu
 *     faylning tepasidagi "ATAYLAB" izohi.
 *   - client: `media-fragen-types.ts`dagi `FrageFormat` e'lonining O'ZI,
 *     matn sifatida o'qib, undagi satr literallarini ajratib olamiz.
 * Ikkalasi ham «kimdir formatlar ro'yxatini o'zgartirsa shu joy ham
 * o'zgaradi»gan haqiqiy artefakt — bu testga alohida yangilanish kerak
 * bo'lmaydi, faqat ikki tomon ROZI bo'lishini tekshiradi.
 */
describe("FrageFormat parity — server VORSCHAU_BAUER vs client e'loni", () => {
  function clientFrageFormatlari(): string[] {
    const clientPath = path.join(
      __dirname,
      '../../../../client/src/components/media/media-fragen-types.ts',
    );
    const source = fs.readFileSync(clientPath, 'utf8');
    const match = source.match(/export type FrageFormat\s*=([\s\S]*?);/);
    if (!match) {
      throw new Error(
        "media-fragen-types.ts'dan FrageFormat e'loni topilmadi — fayl " +
          'boshqacha tuzilishga o\'tgan bo\'lishi mumkin, shu testni ham ' +
          "moslashtiring (regex endi ishlamaydi, qo'lda solishtirish ham yaramaydi)",
      );
    }
    return Array.from(match[1].matchAll(/["']([A-Z_]+)["']/g)).map(
      (m) => m[1],
    );
  }

  it("ikkala tomon bir xil format to'plamini sanaydi", () => {
    const serverFormatlari = Object.keys(VORSCHAU_BAUER).sort();
    const clientFormatlari = clientFrageFormatlari().sort();

    // `toEqual` (`toBe` emas) — ikkalasi ham massiv, tartib `sort()` bilan
    // allaqachon me'yorlashtirilgan; qiziqarli farq ELEMENTLAR to'plamida,
    // massiv identifikatorida emas.
    expect(clientFormatlari).toEqual(serverFormatlari);
  });
});
