import {
  hochzuladen,
  ladeNacheinander,
  parseDialogBildArgs,
} from './daf-upload-dialog-bilder';

const argv = (...rest: string[]) => [
  'node',
  'daf-upload-dialog-bilder.ts',
  ...rest,
];
const KEY = 'daf/bild/0123456789abcdef0123456789abcdef.jpg';
const DIALOGE = new Set(['u04-d1', 'u04-d2', 'u04-d10']);

describe('parseDialogBildArgs', () => {
  it('reads --unit, --dir and --dry-run', () => {
    expect(
      parseDialogBildArgs(argv('--unit', '4', '--dir', '/x', '--dry-run')),
    ).toEqual({ unit: 'u04', dir: '/x', dryRun: true });
  });

  it('needs --unit and --dir', () => {
    expect(() => parseDialogBildArgs(argv('--dir', '/x'))).toThrow(/--unit/);
    expect(() => parseDialogBildArgs(argv('--unit', '4'))).toThrow(/--dir/);
  });
});

describe('hochzuladen', () => {
  it('lists the unit`s pictures not yet in the manifest, in dialog order', () => {
    expect(
      hochzuladen(
        ['u04-d10-bild.jpg', 'u04-d2-bild.jpg', 'u04-d1-bild.jpg', 'notiz.txt'],
        'u04',
        DIALOGE,
        { 'u04-d1': KEY },
      ),
    ).toEqual(['u04-d2', 'u04-d10']);
  });

  it('ignores other units`s files', () => {
    expect(hochzuladen(['u03-d1-bild.jpg'], 'u04', DIALOGE, {})).toEqual([]);
  });

  it('refuses a picture for a dialog the unit does not have (a typo)', () => {
    expect(() => hochzuladen(['u04-d99-bild.jpg'], 'u04', DIALOGE, {})).toThrow(
      /u04-d99/,
    );
  });
});

describe('ladeNacheinander', () => {
  it('saves the manifest after every upload', async () => {
    const manifest: Record<string, string> = {};
    const gespeichert: string[][] = [];
    await ladeNacheinander(
      ['u04-d1', 'u04-d2'],
      manifest,
      async (id) => `daf/bild/${id}.jpg`,
      (m) => gespeichert.push(Object.keys(m)),
    );
    expect(gespeichert).toEqual([['u04-d1'], ['u04-d1', 'u04-d2']]);
  });

  it('a failure keeps what was already uploaded and names the dialog', async () => {
    const manifest: Record<string, string> = {};
    await expect(
      ladeNacheinander(
        ['u04-d1', 'u04-d2'],
        manifest,
        async (id) => {
          if (id === 'u04-d2') throw new Error('network');
          return KEY;
        },
        () => undefined,
      ),
    ).rejects.toThrow(/u04-d2.*network/);
    expect(manifest).toEqual({ 'u04-d1': KEY });
  });
});
