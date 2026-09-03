import { FalClient } from './fal-client';

function fetchStub(body: unknown, ok = true): typeof fetch {
  return (async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('FalClient.image', () => {
  it('birinchi rasmning manzilini qaytaradi', async () => {
    const c = new FalClient(
      'k',
      fetchStub({ images: [{ url: 'https://x/a.jpg' }] }),
    );
    expect(await c.image('p', 1)).toBe('https://x/a.jpg');
  });

  // Jimgina `undefined` qaytarish keyinroq R2 ga bo'sh kalit yozardi.
  it('rasm qaytmasa yiqiladi', async () => {
    const c = new FalClient('k', fetchStub({ images: [] }));
    await expect(c.image('p', 1)).rejects.toThrow(/rasm/i);
  });

  it('xato javobda holat kodini xabarga qo`yadi', async () => {
    const c = new FalClient('k', fetchStub({ error: 'nope' }, false));
    await expect(c.image('p', 1)).rejects.toThrow(/500/);
  });
});

describe('FalClient.speech', () => {
  it('ovoz manzilini qaytaradi', async () => {
    const c = new FalClient(
      'k',
      fetchStub({ audio: { url: 'https://x/a.mp3' } }),
    );
    expect(await c.speech('Hallo')).toBe('https://x/a.mp3');
  });

  it('ovoz qaytmasa yiqiladi', async () => {
    const c = new FalClient('k', fetchStub({}));
    await expect(c.speech('Hallo')).rejects.toThrow(/ovoz/i);
  });
});
