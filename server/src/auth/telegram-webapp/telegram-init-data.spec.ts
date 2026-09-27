import { createHmac } from 'crypto';
import { INIT_DATA_MAX_AGE_SEC, checkInitData } from './telegram-init-data';

const TOKEN = '123456789:AAFakeBotTokenForTestsOnly';
const NOW = 1_780_000_000;
const USER = JSON.stringify({ id: 700000001, first_name: 'Dilnoza' });

/**
 * Telegram'ning hujjatlashtirilgan algoritmi bilan imzolaydi. Tekshiruvchidan
 * ALOHIDA yozilgan: ikkalasi bitta kodni chaqirsa, algoritmdagi xato ikkala
 * tomonda ham bir xil bo'lib, test uni ko'rmasdi. Tashqi tasdiq — pastdagi
 * aiogram vektori.
 */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const fresh = (extra: Record<string, string> = {}) =>
  sign({
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: USER,
    auth_date: String(NOW),
    ...extra,
  });

describe('checkInitData', () => {
  it("Telegram imzolagan satrdan foydalanuvchi id'sini satr qilib qaytaradi", () => {
    expect(checkInitData(fresh(), TOKEN, NOW)).toEqual({
      ok: true,
      telegramUserId: '700000001',
    });
  });

  it("aiogram'ning test vektorini tasdiqlaydi (mustaqil implementatsiya)", () => {
    // aiogram/tests/test_utils/test_web_app.py — token "42:TEST". Bu vektorni
    // boshqa kod yasagan, shuning uchun u algoritmning o'zini tekshiradi:
    // saralash, `\n`, "WebAppData" kaliti va HMAC argumentlari tartibi.
    const initData =
      'auth_date=1650385342&user=%7B%22id%22%3A42%2C%22first_name%22%3A%22Test%22%7D' +
      '&query_id=test&hash=46d2ea5e32911ec8d30999b56247654460c0d20949b6277af519e76271182803';
    expect(checkInitData(initData, '42:TEST', 1650385342)).toEqual({
      ok: true,
      telegramUserId: '42',
    });
  });

  it("`signature` maydonini (Bot API 8.0) ham imzolangan satrga qo'shadi", () => {
    const initData = fresh({ signature: 'c2lnbmF0dXJlLWZvci10ZXN0cw' });
    expect(checkInitData(initData, TOKEN, NOW).ok).toBe(true);
  });

  it('boshqa bot tokeni bilan imzolangan satrni rad etadi', () => {
    const foreign = sign(
      { user: USER, auth_date: String(NOW) },
      '987654321:AAAnotherBotsToken',
    );
    expect(checkInitData(foreign, TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it("imzodan keyin o'zgartirilgan foydalanuvchini rad etadi", () => {
    const tampered = new URLSearchParams(fresh());
    tampered.set('user', JSON.stringify({ id: 700000002, first_name: 'X' }));
    expect(checkInitData(tampered.toString(), TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it("takrorlangan kalitni rad etadi — imzolangan satrga qo'shilgan ikkinchi `user=`", () => {
    const smuggled = `${fresh()}&user=${encodeURIComponent(
      JSON.stringify({ id: 700000002 }),
    )}`;
    expect(checkInitData(smuggled, TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it.each([
    ["bo'sh satr", ''],
    ["hash yo'q", 'auth_date=1&user=%7B%7D'],
    ['hash hex emas', `user=%7B%7D&hash=${'z'.repeat(64)}`],
    ['hash qisqa', 'user=%7B%7D&hash=abc123'],
  ])('shakli buzilgan satrni rad etadi: %s', (_label, initData) => {
    expect(checkInitData(initData, TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it("`auth_date` son bo'lmasa rad etadi (imzo to'g'ri bo'lsa ham)", () => {
    const initData = sign({ user: USER, auth_date: 'kecha' });
    expect(checkInitData(initData, TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  describe('muddat', () => {
    it('chegarada hali qabul qilinadi', () => {
      const initData = sign({
        user: USER,
        auth_date: String(NOW - INIT_DATA_MAX_AGE_SEC),
      });
      expect(checkInitData(initData, TOKEN, NOW).ok).toBe(true);
    });

    it('chegaradan bir soniya keyin eskirgan', () => {
      const initData = sign({
        user: USER,
        auth_date: String(NOW - INIT_DATA_MAX_AGE_SEC - 1),
      });
      expect(checkInitData(initData, TOKEN, NOW)).toEqual({
        ok: false,
        reason: 'expired',
      });
    });

    it("soat farqi uchun bir daqiqa oldinga ruxsat beradi, undan ko'pga emas", () => {
      const skewed = sign({ user: USER, auth_date: String(NOW + 60) });
      const future = sign({ user: USER, auth_date: String(NOW + 61) });
      expect(checkInitData(skewed, TOKEN, NOW).ok).toBe(true);
      expect(checkInitData(future, TOKEN, NOW)).toEqual({
        ok: false,
        reason: 'expired',
      });
    });
  });

  describe('foydalanuvchi', () => {
    it.each([
      ["user maydoni yo'q", undefined],
      ['JSON emas', 'not-json'],
      ["id yo'q", JSON.stringify({ first_name: 'Dilnoza' })],
      ['id satr', JSON.stringify({ id: '700000001' })],
      ['id manfiy', JSON.stringify({ id: -700000001 })],
      ['id kasr', JSON.stringify({ id: 7.5 })],
      // 2^53 dan katta: JSON soni sifatida aniqligini yo'qotadi va boshqa
      // odamning id'siga aylanib qolishi mumkin.
      ['id xavfsiz butun sondan katta', '{"id":9007199254740993}'],
      ['obyekt emas', JSON.stringify(700000001)],
    ])("imzo to'g'ri, lekin %s — rad", (_label, user) => {
      const fields: Record<string, string> = { auth_date: String(NOW) };
      if (user !== undefined) fields.user = user;
      expect(checkInitData(sign(fields), TOKEN, NOW)).toEqual({
        ok: false,
        reason: 'no_user',
      });
    });
  });
});
