import { mkdtempSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CachedHttpClient, cacheKeyFor } from './cached-http-client';

describe('cacheKeyFor', () => {
  it('bir xil URL uchun bir xil kalit beradi', () => {
    expect(cacheKeyFor('https://x/a?b=1')).toBe(cacheKeyFor('https://x/a?b=1'));
  });

  it("ajratgichlari boshqacha, lekin o'xshash URL'larni ajratadi", () => {
    // Eski DiB kaliti bu ikkalasini bir xil faylga tushirardi
    expect(cacheKeyFor('https://x/p?a=1&b=2')).not.toBe(
      cacheKeyFor('https://x/p?a=1_b=2'),
    );
  });
});

describe('CachedHttpClient.fetchText', () => {
  it("birinchi so'rovda tarmoqqa boradi va diskka yozadi", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'http-'));
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>salom</html>',
    });

    const c = new CachedHttpClient(dir, fetchFn as never);
    expect(await c.fetchText('https://x/a')).toBe('<html>salom</html>');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(readdirSync(dir)).toHaveLength(1);
  });

  it("kesh bor bo'lsa tarmoqqa bormaydi", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'http-'));
    writeFileSync(join(dir, cacheKeyFor('https://x/a')), 'keshdagi', 'utf8');
    const fetchFn = jest.fn();

    const c = new CachedHttpClient(dir, fetchFn as never);
    expect(await c.fetchText('https://x/a')).toBe('keshdagi');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('HTTP xatosida URL bilan birga yiqiladi', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'http-'));
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    const c = new CachedHttpClient(dir, fetchFn as never);
    await expect(c.fetchText('https://x/yoq')).rejects.toThrow(
      'Manba javob bermadi (404): https://x/yoq',
    );
  });

  it("yiqilgan so'rovdan keyin keshda fayl qoldirmaydi", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'http-'));
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => '' });

    const c = new CachedHttpClient(dir, fetchFn as never);
    await expect(c.fetchText('https://x/a')).rejects.toThrow();
    expect(readdirSync(dir)).toHaveLength(0);
  });
});
