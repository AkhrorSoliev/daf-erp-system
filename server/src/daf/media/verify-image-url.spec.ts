import { verifyImageUrl } from './verify-image-url';

function fetchStub(status: number, contentType: string | null): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (_name: string) => contentType },
  })) as unknown as typeof fetch;
}

describe('verifyImageUrl', () => {
  it('200 + image/* bo`lsa ok', async () => {
    const r = await verifyImageUrl(
      'https://x/a.jpg',
      fetchStub(200, 'image/jpeg'),
    );
    expect(r).toEqual({ ok: true, status: 200, contentType: 'image/jpeg' });
  });

  // Aynan shu holat singan `#` kaliti bilan sodir bo'lgan: URL
  // to'g'ri ko'rinadi, lekin server xato sahifasi (HTML) qaytaradi.
  it('200 lekin HTML qaytsa ok emas — xato sahifasi rasm emas', async () => {
    const r = await verifyImageUrl('https://x/a', fetchStub(200, 'text/html'));
    expect(r.ok).toBe(false);
  });

  it('404 bo`lsa ok emas', async () => {
    const r = await verifyImageUrl(
      'https://x/missing.jpg',
      fetchStub(404, null),
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });
});
