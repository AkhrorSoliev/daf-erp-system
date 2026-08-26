import { R2Uploader } from './r2-uploader';
import type { AssetRef } from '../dataset.types';

const A: AssetRef = {
  sourceUrl: 'https://x/a.mp3',
  key: 'dib/audio/a.mp3',
  kind: 'AUDIO',
  license: 'CC BY 4.0',
  attribution: 'COERLL',
};

function make(over: { fetchFn?: jest.Mock } = {}) {
  const send = jest.fn();
  const s3 = { send } as never;
  const fetchFn =
    over.fetchFn ??
    jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
  return { s3, send, fetchFn, up: new R2Uploader(s3, 'bucket', fetchFn as never) };
}

describe('R2Uploader.uploadMissing', () => {
  it('R2\'da yo\'q faylni yuklaydi', async () => {
    const { up, send, fetchFn } = make();
    send
      .mockRejectedValueOnce({ name: 'NotFound' }) // HeadObject
      .mockResolvedValueOnce({}); // PutObject

    const r = await up.uploadMissing([A]);

    expect(r).toEqual({ uploaded: 1, skipped: 0, failed: [] });
    expect(fetchFn).toHaveBeenCalledWith('https://x/a.mp3');
  });

  it('R2\'da bor faylni qayta yuklamaydi', async () => {
    const { up, send, fetchFn } = make();
    send.mockResolvedValueOnce({ ContentLength: 8 }); // HeadObject topdi

    const r = await up.uploadMissing([A]);

    expect(r).toEqual({ uploaded: 0, skipped: 1, failed: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('manba javob bermasa, boshqa fayllarni to\'xtatmaydi va sababini yozadi', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const { up, send } = make({ fetchFn });
    send.mockRejectedValue({ name: 'NotFound' });

    const r = await up.uploadMissing([A]);

    expect(r.uploaded).toBe(0);
    expect(r.failed).toEqual([{ key: 'dib/audio/a.mp3', reason: 'HTTP 500' }]);
  });

  it('manba so\'rovi tarmoq xatosi bilan rad etilsa ham, sababi bilan qayd etiladi', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('network timeout'));
    const { up, send } = make({ fetchFn });
    send.mockRejectedValue({ name: 'NotFound' });

    const r = await up.uploadMissing([A]);

    expect(r.uploaded).toBe(0);
    expect(r.failed).toEqual([
      { key: 'dib/audio/a.mp3', reason: 'network timeout' },
    ]);
  });

  it('PutObject rad etilsa, sababi bilan qayd etiladi va ijro davom etadi', async () => {
    const { up, send } = make();
    send
      .mockRejectedValueOnce({ name: 'NotFound' }) // HeadObject - yo'q
      .mockRejectedValueOnce({ name: 'AccessDenied', message: 'Access Denied' }); // PutObject rad etildi

    const r = await up.uploadMissing([A]);

    expect(r.uploaded).toBe(0);
    expect(r.failed).toEqual([
      { key: 'dib/audio/a.mp3', reason: 'Access Denied' },
    ]);
  });

  it('HeadObject 403 bilan yiqilsa, "yo\'q" deb hisoblanmaydi va yuqoriga uloqtiriladi', async () => {
    const { up, send } = make();
    send.mockRejectedValue({
      name: 'Forbidden',
      $metadata: { httpStatusCode: 403 },
    });

    await expect(up.uploadMissing([A])).rejects.toMatchObject({
      name: 'Forbidden',
    });
  });

  it('litsenziyani R2 metama\'lumotiga yozadi', async () => {
    const { up, send } = make();
    send.mockRejectedValueOnce({ name: 'NotFound' }).mockResolvedValueOnce({});

    await up.uploadMissing([A]);

    const put = send.mock.calls[1][0];
    expect(put.input.Metadata).toEqual({
      license: 'CC BY 4.0',
      attribution: 'COERLL',
      source: 'https://x/a.mp3',
    });
  });
});
