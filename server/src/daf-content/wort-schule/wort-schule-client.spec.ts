import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WortSchuleClient, WS_BASE } from './wort-schule-client';

describe('WortSchuleClient.fetchWord', () => {
  it("so'z topilganda JSON matnini qaytaradi", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-'));
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"name":"dick"}',
    });

    const client = new WortSchuleClient(dir, fetchFn as never);
    expect(await client.fetchWord('dick')).toBe('{"name":"dick"}');
    expect(fetchFn).toHaveBeenCalledWith(
      `${WS_BASE}dick.json`,
      expect.anything(),
    );
  });

  it("404 uchun null qaytaradi, xato tashlamaydi — so'z shunchaki yo'q", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-'));
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    const client = new WortSchuleClient(dir, fetchFn as never);
    await expect(client.fetchWord('yoq')).resolves.toBeNull();
  });

  it("boshqa xatolarni (masalan 500) qayta tashlaydi — bu 'so'z yo'q' emas", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-'));
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => '' });

    const client = new WortSchuleClient(dir, fetchFn as never);
    await expect(client.fetchWord('x')).rejects.toThrow(
      `Manba javob bermadi (500): ${WS_BASE}x.json`,
    );
  });

  it('tarmoq xatosini ham qayta tashlaydi', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-'));
    const fetchFn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

    const client = new WortSchuleClient(dir, fetchFn as never);
    await expect(client.fetchWord('x')).rejects.toThrow('ECONNRESET');
  });
});
