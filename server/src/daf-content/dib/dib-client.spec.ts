import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cacheKeyFor } from '../http/cached-http-client';
import { DibClient, DIB_BASE } from './dib-client';

describe('DibClient.fetchText', () => {
  it("birinchi so'rovda tarmoqqa boradi va diskka yozadi", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dib-'));
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>salom</html>',
    });

    const client = new DibClient(dir, fetchFn as never);
    const html = await client.fetchText('voc.php?k=1');

    expect(html).toBe('<html>salom</html>');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(
      readFileSync(join(dir, cacheKeyFor(DIB_BASE + 'voc.php?k=1')), 'utf8'),
    ).toBe('<html>salom</html>');
  });

  it("kesh bor bo'lsa tarmoqqa umuman bormaydi", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dib-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, cacheKeyFor(DIB_BASE + 'voc.php?k=1')),
      'keshdagi',
      'utf8',
    );
    const fetchFn = jest.fn();

    const client = new DibClient(dir, fetchFn as never);
    expect(await client.fetchText('voc.php?k=1')).toBe('keshdagi');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('HTTP xatosida tushunarli xabar bilan yiqiladi', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dib-'));
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    const client = new DibClient(dir, fetchFn as never);
    await expect(client.fetchText('yoq.php')).rejects.toThrow(
      `Manba javob bermadi (404): ${DIB_BASE}yoq.php`,
    );
  });
});
