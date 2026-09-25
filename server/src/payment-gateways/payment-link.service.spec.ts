import { PaymentLinkService } from './payment-link.service';

/**
 * Click checkout havolasi ochiq: Telegram chatiga, brauzer tarixiga tushadi.
 * `CLICK_SERVICE_ID` yo'q bo'lsa, uning o'rniga MAXFIY kalit (webhook
 * imzosini tekshiradigan) `service_id=` ga qo'yilardi — kalitni bilgan odam
 * Complete so'rovini soxtalashtirib, to'lamasdan "to'landi" qila olardi.
 */
describe('PaymentLinkService — Click havolasi', () => {
  const SECRET = 'click-secret-key';

  function build(env: Record<string, string | undefined>) {
    const gatewayConfig = {
      getConfig: jest
        .fn()
        .mockResolvedValue({ merchantId: 'm-1', secretKey: SECRET }),
    };
    const config = { get: jest.fn((k: string) => env[k]) };
    return new PaymentLinkService(
      {} as any,
      gatewayConfig as any,
      config as any,
    );
  }

  it("CLICK_SERVICE_ID yo'q bo'lsa maxfiy kalit havolaga tushmaydi", async () => {
    const links = await build({}).buildLinks(10050, 30000, 1001);

    expect(links.click).toBeNull();
    expect(JSON.stringify(links)).not.toContain(SECRET);
  });

  it('CLICK_SERVICE_ID bor bo‘lsa havola service_id bilan quriladi', async () => {
    const links = await build({ CLICK_SERVICE_ID: 'svc-9' }).buildLinks(
      10050,
      30000,
      1001,
    );

    expect(links.click).toContain('service_id=svc-9');
    expect(links.click).not.toContain(SECRET);
  });
});
