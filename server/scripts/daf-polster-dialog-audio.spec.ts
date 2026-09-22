import {
  zuPolsterndeEintraege,
  polstereEintrag,
} from './daf-polster-dialog-audio';
import { POLSTER_KENNUNG } from '../src/daf/media/audio-polster';
import type { DialogAudioManifest } from '../src/daf/inhalt/dialog-audio';

describe('zuPolsterndeEintraege', () => {
  it('`polster` maydoni YO`Q yozuvni tanlaydi — hali ishlanmagan', () => {
    const manifest: DialogAudioManifest = {
      'u01-d1': { key: 'a.mp3', textHash: 'h1' },
    };
    expect(zuPolsterndeEintraege(manifest)).toEqual(['u01-d1']);
  });

  it('`polster` ALLAQACHON `POLSTER_KENNUNG` bo`lgan yozuvni o`tkazib yuboradi', () => {
    const manifest: DialogAudioManifest = {
      'u01-d1': { key: 'a.mp3', textHash: 'h1', polster: POLSTER_KENNUNG },
    };
    expect(zuPolsterndeEintraege(manifest)).toEqual([]);
  });

  // Ko'rik (2026-09-13): ilgari bu holat "qayta ishlash kerak" deb
  // TANLANARDI — lekin R2'da faqat PADDED audio bor, xom asl nusxa
  // saqlanmagan, shuning uchun "qayta ishlash" aslida ALLAQACHON
  // jimlik qo'shilgan faylni yana bir bor ishlab, ustiga yana jimlik
  // qo'shib qo'yardi (masalan boshida 700+700=1400 ms). Endi bunday
  // yozuv TANLANMAYDI — funksiyaning O'ZI xato tashlab TO'XTAYDI,
  // hech qanday yuklab olish/yuklash boshlanmasdan OLDIN.
  it('joriy bilan mos kelmagan `polster`li yozuv topilsa — TO`XTAYDI (qayta ishlamaydi)', () => {
    const manifest: DialogAudioManifest = {
      'u01-d1': { key: 'a.mp3', textHash: 'h1', polster: '100/100' },
    };
    expect(() => zuPolsterndeEintraege(manifest)).toThrow(/u01-d1/);
  });

  it('xato xabarida ESKI va JORIY qiymatlarning ikkalasi ham bor', () => {
    const manifest: DialogAudioManifest = {
      'u01-d1': { key: 'a.mp3', textHash: 'h1', polster: '100/100' },
    };
    expect(() => zuPolsterndeEintraege(manifest)).toThrow(
      new RegExp(`100/100.*${POLSTER_KENNUNG}|${POLSTER_KENNUNG}.*100/100`),
    );
  });

  it('mos kelmagan `polster` topilsa, undan OLDINGI to`g`ri yozuvlarni ham tekshirmasdan to`xtaydi', () => {
    // "Hech qanday yuklab olish/yuklashdan OLDIN to'xtash" talabi: bu
    // funksiya SOF va tarmoqqa chiqmaydi, shuning uchun bu yerda faqat
    // "chaqiruv umuman natija QAYTARMAYDI, xato tashlaydi" tekshiriladi
    // — chaqiruvchi (`main()`) natija olmasa, pastdagi `for` sikli
    // (yuklab olish/yuklash) UMUMAN boshlanmaydi.
    const manifest: DialogAudioManifest = {
      'u01-d1': { key: 'a.mp3', textHash: 'h1' }, // o'zi ishlanishi kerak edi
      'u01-d2': { key: 'b.mp3', textHash: 'h2', polster: '100/100' }, // mos kelmaydi
    };
    expect(() => zuPolsterndeEintraege(manifest)).toThrow(/u01-d2/);
  });

  it('aralash manifestda faqat ishlanmagan yozuvlarni qaytaradi — tartib saqlanadi', () => {
    const manifest: DialogAudioManifest = {
      a: { key: 'a.mp3', textHash: 'h', polster: POLSTER_KENNUNG },
      b: { key: 'b.mp3', textHash: 'h' },
      c: { key: 'c.mp3', textHash: 'h' },
    };
    expect(zuPolsterndeEintraege(manifest)).toEqual(['b', 'c']);
  });
});

// Tarmoqsiz: fetchFn/polster/uploader hammasi soxta.
describe('polstereEintrag', () => {
  it("R2'dan yuklab oladi, jimlik qo`shadi, YANGI kalit bilan yuklaydi — textHashga tegmaydi", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const polster = jest.fn().mockResolvedValue(Buffer.from([9, 9]));
    const uploadBytes = jest.fn().mockResolvedValue(undefined);

    const natija = await polstereEintrag(
      'daf/audio/eski.mp3',
      'https://pub.example.com',
      fetchFn as never,
      polster,
      { uploadBytes },
    );

    expect(fetchFn).toHaveBeenCalledWith(
      'https://pub.example.com/daf/audio/eski.mp3',
    );
    expect(polster).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(uploadBytes).toHaveBeenCalledTimes(1);
    const [yangiKalit, yuklanganBaytlar] = uploadBytes.mock.calls[0];
    expect(yuklanganBaytlar).toEqual(Buffer.from([9, 9]));
    expect(yangiKalit).not.toBe('daf/audio/eski.mp3');
    expect(natija).toEqual({ key: yangiKalit, polster: POLSTER_KENNUNG });
  });

  it('ochirg`ich (trailing) SLASH BILAN manzilda ham to`g`ri URL quradi (ikkilanmaydi)', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    const polster = jest.fn().mockResolvedValue(Buffer.from([1]));
    const uploadBytes = jest.fn().mockResolvedValue(undefined);

    await polstereEintrag(
      'daf/audio/x.mp3',
      'https://pub.example.com/',
      fetchFn as never,
      polster,
      { uploadBytes },
    );

    expect(fetchFn).toHaveBeenCalledWith(
      'https://pub.example.com/daf/audio/x.mp3',
    );
  });

  it('R2 javob bermasa (HTTP xato), TO`XTAYDI — jimlik va yuklash chaqirilmaydi', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const polster = jest.fn();
    const uploadBytes = jest.fn();

    await expect(
      polstereEintrag(
        'daf/audio/yoq.mp3',
        'https://pub.example.com',
        fetchFn as never,
        polster,
        { uploadBytes },
      ),
    ).rejects.toThrow(/HTTP 404/);
    expect(polster).not.toHaveBeenCalled();
    expect(uploadBytes).not.toHaveBeenCalled();
  });
});
