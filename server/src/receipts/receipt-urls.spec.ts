import { apiBaseUrl, refundReceiptPdfUrl } from './receipt-urls';

describe('receipt urls', () => {
  const saved = {
    api: process.env.API_BASE_URL,
    railway: process.env.RAILWAY_PUBLIC_DOMAIN,
  };
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  afterEach(() => {
    restore('API_BASE_URL', saved.api);
    restore('RAILWAY_PUBLIC_DOMAIN', saved.railway);
  });

  it('API_BASE_URL wins, then the Railway domain, then the production host', () => {
    process.env.API_BASE_URL = 'https://api.example.uz';
    process.env.RAILWAY_PUBLIC_DOMAIN = 'svc.example.app';
    expect(refundReceiptPdfUrl('r1')).toBe(
      'https://api.example.uz/api/receipts/refund/r1.pdf',
    );

    delete process.env.API_BASE_URL;
    expect(apiBaseUrl()).toBe('https://svc.example.app');

    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    expect(refundReceiptPdfUrl('r1')).toBe(
      'https://api.dafzentrum.uz/api/receipts/refund/r1.pdf',
    );
  });
});
