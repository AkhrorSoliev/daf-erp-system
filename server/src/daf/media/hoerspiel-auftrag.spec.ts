import {
  benoetigteGeraeusche,
  entscheideDialoge,
  type GeraeuschManifest,
} from './hoerspiel-auftrag';
import { geraeuschId, hoerspielHash } from './hoerspiel';
import { DIALOG_AUDIO_MODELL, dialogTextHash } from '../inhalt/dialog-audio';
import type { Dialog } from '../inhalt/unit-inhalt.types';

const dialog = (id: string): Dialog => ({
  id,
  section: 'u04-s4',
  titelDe: 'T',
  titelUz: 'T',
  zeilen: [
    { sprecher: 'Mia', de: 'Hallo!', uz: 'Salom!' },
    { sprecher: 'Jonas', de: 'Hallo, Mia!', uz: 'Salom, Mia!' },
  ],
});
const hs = { atmo: { sfx: 'kitchen', sek: 15 }, fern: [1] };
const fertig = (d: Dialog, extra: object = {}) => ({
  key: 'daf/audio/a.mp3',
  textHash: dialogTextHash(d.zeilen),
  modell: DIALOG_AUDIO_MODELL,
  ...extra,
});

describe('entscheideDialoge', () => {
  const a = dialog('u04-d1');
  const b = dialog('u04-d2');
  const c = dialog('u04-d3');
  const d = dialog('u04-d4');

  it('voices new text, remixes a changed mix for free, leaves the rest', () => {
    const regie = {
      'u04-d1': { hoerspiel: hs },
      'u04-d2': { hoerspiel: hs },
      'u04-d3': { hoerspiel: hs },
      'u04-d4': {},
    };
    const manifest = {
      // u04-d1: never voiced
      'u04-d2': fertig(b, { rohKey: 'daf/audio/r.mp3', hoerspiel: 'alt' }),
      'u04-d3': fertig(c, {
        rohKey: 'daf/audio/r.mp3',
        hoerspiel: hoerspielHash(hs),
      }),
      'u04-d4': fertig(d),
    };
    expect(entscheideDialoge([a, b, c, d], regie, manifest)).toEqual({
      sprechen: [a],
      mischen: [b],
    });
  });

  it('a voiced dialog with no kept raw recording must be voiced again', () => {
    const r = entscheideDialoge(
      [b],
      { 'u04-d2': { hoerspiel: hs } },
      {
        'u04-d2': fertig(b),
      },
    );
    expect(r).toEqual({ sprechen: [b], mischen: [] });
  });
});

describe('benoetigteGeraeusche', () => {
  it('lists each missing sound once, the room tone as a loop', () => {
    const regie = {
      'u04-d1': {
        hoerspiel: {
          atmo: { sfx: 'kitchen', sek: 15 },
          geraeusche: [{ vor: 1, sfx: 'door', sek: 2 }],
        },
      },
      'u04-d2': {
        hoerspiel: {
          atmo: { sfx: 'kitchen', sek: 15 },
          geraeusche: [{ vor: 2, sfx: 'door', sek: 2, lautstaerke: 0.4 }],
        },
      },
    };
    const manifest: GeraeuschManifest = {
      [geraeuschId({ sfx: 'door', sek: 2 })]: {
        key: 'daf/sfx/x.mp3',
        sfx: 'door',
        sek: 2,
        loop: false,
      },
    };
    expect(
      benoetigteGeraeusche(
        [dialog('u04-d1'), dialog('u04-d2')],
        regie,
        manifest,
      ),
    ).toEqual([
      {
        id: geraeuschId({ sfx: 'kitchen', sek: 15, loop: true }),
        sfx: 'kitchen',
        sek: 15,
        loop: true,
      },
    ]);
  });
});
