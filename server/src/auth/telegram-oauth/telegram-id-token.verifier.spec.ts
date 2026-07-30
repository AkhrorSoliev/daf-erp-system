import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { UnauthorizedException } from '@nestjs/common';
import { TelegramIdTokenVerifier } from './telegram-id-token.verifier';

const CLIENT_ID = '8576891251';
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
  it("to'g'ri tokendan telefon va telegram id ni oladi", async () => {
    const { verifier, sign } = await harness();
    const result = await verifier.verify(await sign(validPayload));
    expect(result).toEqual({
      phoneNumber: '998901234567',
      telegramUserId: '987654321',
    });
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
    const token = await sign({ ...validPayload, iss: 'https://evil.example.com' });
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

  it('phone_number yo\'q bo\'lsa rad etadi', async () => {
    const { verifier, sign } = await harness();
    const { phone_number: _omit, ...withoutPhone } = validPayload;
    await expect(
      verifier.verify(await sign(withoutPhone)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('phone_number_verified false bo\'lsa rad etadi', async () => {
    const { verifier, sign } = await harness();
    const token = await sign({ ...validPayload, phone_number_verified: false });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('umuman token bo\'lmasa rad etadi', async () => {
    const { verifier } = await harness();
    await expect(verifier.verify('')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
