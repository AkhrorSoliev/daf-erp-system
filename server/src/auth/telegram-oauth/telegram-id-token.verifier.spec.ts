import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TelegramIdTokenVerifier } from './telegram-id-token.verifier';
import { TelegramOauthConfig } from './telegram-oauth.config';

const CLIENT_ID = '1234567890';
const ISSUER = 'https://oauth.telegram.org';

/**
 * Soxta JWKS: o'z RSA kalit juftligimiz. Bu testlar tarmoqqa chiqmaydi va
 * imzo tekshiruvining HAQIQATAN ishlashini isbotlaydi.
 */
async function harness() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  const keyResolver = createLocalJWKSet({ keys: [jwk] });

  const other = await generateKeyPair('RS256');

  const sign = async (
    payload: Record<string, unknown>,
    key: CryptoKey = privateKey as CryptoKey,
  ) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

  const verifier = new TelegramIdTokenVerifier(
    { clientId: CLIENT_ID } as any,
    keyResolver,
  );

  return {
    verifier,
    sign,
    otherPrivateKey: other.privateKey as CryptoKey,
    ownPrivateKey: privateKey as CryptoKey,
  };
}

const validPayload = {
  iss: ISSUER,
  aud: CLIENT_ID,
  sub: '1234123412341234123',
  id: 987654321,
  phone_number: '998901234567',
  phone_number_verified: true,
};

describe('TelegramIdTokenVerifier', () => {
  it("to'g'ri tokendan FAQAT telefonni oladi", async () => {
    const { verifier, sign } = await harness();
    const result = await verifier.verify(await sign(validPayload));
    // `id` claim'i tekshiriladi, lekin QAYTARILMAYDI — uni hech kim
    // ishlatmaydi, katta Telegram id'lari esa `number` sifatida 2^53 dan
    // oshib aniqligini yo'qotishi mumkin. `toEqual` (mos emas
    // `toMatchObject`) — qo'shimcha maydon paydo bo'lsa test yiqiladi.
    expect(result).toEqual({ phoneNumber: '998901234567' });
  });

  it('boshqa kalit bilan imzolangan tokenni rad etadi', async () => {
    const { verifier, sign, otherPrivateKey } = await harness();
    const token = await sign(validPayload, otherPrivateKey);
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("noto'g'ri issuer ni rad etadi", async () => {
    const { verifier, sign } = await harness();
    const token = await sign({
      ...validPayload,
      iss: 'https://evil.example.com',
    });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("noto'g'ri audience ni rad etadi", async () => {
    const { verifier, sign } = await harness();
    const token = await sign({ ...validPayload, aud: '111111111' });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("muddati o'tgan tokenni rad etadi", async () => {
    const { verifier, ownPrivateKey } = await harness();
    // Muddati o'tganini ANIQ tekshirish uchun haqiqiy (harness) kalit bilan
    // imzolaymiz — soxta kalit bilan imzolansa xato imzo sababidan ham rad
    // etilar edi, muddat tekshiruvini alohida isbotlamas edi.
    const expired = await new SignJWT(validPayload as any)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(ownPrivateKey);
    await expect(verifier.verify(expired)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("phone_number yo'q bo'lsa rad etadi", async () => {
    const { verifier, sign } = await harness();
    const { phone_number: _omit, ...withoutPhone } = validPayload;
    await expect(
      verifier.verify(await sign(withoutPhone)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("phone_number_verified false bo'lsa rad etadi", async () => {
    const { verifier, sign } = await harness();
    const token = await sign({ ...validPayload, phone_number_verified: false });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("umuman token bo'lmasa rad etadi", async () => {
    const { verifier } = await harness();
    await expect(verifier.verify('')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("phone_number_verified string 'true' bo'lsa rad etadi (qat'iy boolean tekshiruvi)", async () => {
    const { verifier, sign } = await harness();
    const token = await sign({
      ...validPayload,
      phone_number_verified: 'true' as unknown as boolean,
    });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("phone_number_verified 1 (raqam) bo'lsa rad etadi (qat'iy boolean tekshiruvi)", async () => {
    const { verifier, sign } = await harness();
    const token = await sign({
      ...validPayload,
      phone_number_verified: 1 as unknown as boolean,
    });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  /**
   * HAQIQIY TELEGRAM TOKENIDA `id` CLAIM'I YO'Q.
   *
   * `oauth.telegram.org/.well-known/openid-configuration` dagi
   * `claims_supported` ro'yxati: aud, preferred_username, phone_number, exp,
   * iat, iss, name, picture, sub. Hujjatdagi MISOL payload'da `id` bor edi va
   * biz o'shanga qarab uni majburiy qilib qo'ygan edik — natijada prod'da har
   * bir kirish «Telegram javobi tekshirilmadi» bilan rad etildi (2026-08-01).
   *
   * Qiymati bizga baribir kerak emas (`VerifiedTelegramIdentity` faqat
   * `phoneNumber` qaytaradi), shuning uchun claim butunlay ixtiyoriy.
   */
  it("id claim YO'Q bo'lsa ham qabul qiladi (Telegram uni yubormaydi)", async () => {
    const { verifier, sign } = await harness();
    const { id: _omit, ...withoutId } = validPayload;

    await expect(verifier.verify(await sign(withoutId))).resolves.toEqual({
      phoneNumber: '998901234567',
    });
  });

  it.each([
    ['object', { a: 1 }],
    ['array', [1, 2]],
    ['boolean', true],
    ['null', null],
  ])(
    "id claim g'alati (%s) bo'lsa ham to'sib qo'ymaydi — u ishlatilmaydi",
    async (_label, oddId) => {
      const { verifier, sign } = await harness();
      const token = await sign({ ...validPayload, id: oddId as unknown });

      await expect(verifier.verify(token)).resolves.toEqual({
        phoneNumber: '998901234567',
      });
    },
  );

  it("clientId bo'sh bo'lsa, boshqa jihatdan mukammal tokenni ham rad etadi", async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'test-key';
    jwk.alg = 'RS256';
    const keyResolver = createLocalJWKSet({ keys: [jwk] });

    // aud claim bo'sh clientId bilan solishtirilmasin deb ataylab '' emas,
    // haqiqiy CLIENT_ID bilan imzolaymiz — yagona muammo config.clientId
    // bo'shligi bo'lishi kerak.
    const token = await new SignJWT(validPayload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey as CryptoKey);

    const verifier = new TelegramIdTokenVerifier(
      { clientId: '' } as any,
      keyResolver,
    );
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("exp claim yo'q bo'lsa rad etadi (muddatsiz token abadiy amal qilmasligi kerak)", async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'test-key';
    jwk.alg = 'RS256';
    const keyResolver = createLocalJWKSet({ keys: [jwk] });

    const verifier = new TelegramIdTokenVerifier(
      { clientId: CLIENT_ID } as any,
      keyResolver,
    );

    // Ataylab `.setExpirationTime(...)` chaqirilmaydi — `exp` claim umuman
    // yo'q token yasaymiz.
    const noExpToken = await new SignJWT(validPayload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .sign(privateKey as CryptoKey);

    await expect(verifier.verify(noExpToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("Nest DI konteynerida TelegramIdTokenVerifier muammosiz resolve bo'ladi (ilova ko'tarilishini isbotlaydi)", async () => {
    // Bu test Critical topilmani ushlaydi: `keyResolver?: JWTVerifyGetKey`
    // ixtiyoriy parametri `@Inject` tokenisiz Nest uchun `Function` tokeni
    // sifatida ko'rinadi va butun ilova ko'tarilmay qoladi. Bu yerda
    // haqiqiy Nest konteyneri orqali provider ro'yxatidan o'tkazamiz —
    // `new TelegramIdTokenVerifier(...)` to'g'ridan-to'g'ri chaqiruvi buni
    // hech qachon ko'rmas edi.
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: TelegramOauthConfig, useValue: { clientId: CLIENT_ID } },
        TelegramIdTokenVerifier,
      ],
    }).compile();

    expect(moduleRef.get(TelegramIdTokenVerifier)).toBeInstanceOf(
      TelegramIdTokenVerifier,
    );
  });
});
