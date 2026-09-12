import {
  dialogInputs,
  gesamtZeichenDialoge,
  pruefeDialogBudget,
  zuGenerierenDialoge,
  BELGI_CHEGARASI_DIALOG,
} from './daf-gen-dialog-audio';
import { dialogTextHash } from '../src/daf/inhalt/dialog-audio';
import type { Dialog } from '../src/daf/inhalt/unit-inhalt.types';

const stimmen = { Anna: 'Aria', Jonas: 'Liam' };

const d = (id: string): Dialog => ({
  id,
  section: 'u02-s1',
  titelDe: 'x',
  titelUz: 'x',
  zeilen: [
    { sprecher: 'Anna', de: 'Ist das deine Schwester?', uz: 'x' },
    { sprecher: 'Jonas', de: 'Nein.', uz: 'x', tts: 'Nain.' },
  ],
});

describe('dialogInputs', () => {
  it('har satrga obrazning ovozini biriktiradi, matn tts ?? de', () => {
    expect(dialogInputs(d('u02-d2'), stimmen)).toEqual([
      { voice: 'Aria', text: 'Ist das deine Schwester?' },
      { voice: 'Liam', text: 'Nain.' },
    ]);
  });

  it('ro`yxatda yo`q gapiruvchida TO`XTAYDI — jimgina standart ovoz yo`q', () => {
    expect(() => dialogInputs(d('u02-d2'), { Anna: 'Aria' })).toThrow(
      /Jonas.*stimmen\.json/,
    );
  });
});

describe('zuGenerierenDialoge', () => {
  it('manifestda xeshi mos dialogni o`tkazib yuboradi — idempotent', () => {
    const a = d('u02-d1');
    const manifest = {
      'u02-d1': { key: 'daf/audio/a.mp3', textHash: dialogTextHash(a.zeilen) },
    };
    expect(
      zuGenerierenDialoge([a, d('u02-d2')], manifest).map((x) => x.id),
    ).toEqual(['u02-d2']);
  });

  it('xeshi eskirgan dialogni QAYTA yasaydi', () => {
    const a = d('u02-d1');
    const manifest = { 'u02-d1': { key: 'daf/audio/a.mp3', textHash: '0000' } };
    expect(zuGenerierenDialoge([a], manifest).map((x) => x.id)).toEqual([
      'u02-d1',
    ]);
  });
});

describe('budjet', () => {
  it('belgi sonini tts ?? de bo`yicha sanaydi', () => {
    expect(gesamtZeichenDialoge([d('x')])).toBe(
      'Ist das deine Schwester?'.length + 'Nain.'.length,
    );
  });

  it('chegaradan oshsa chaqiruvdan OLDIN to`xtaydi', () => {
    expect(() => pruefeDialogBudget(BELGI_CHEGARASI_DIALOG + 1)).toThrow(
      /TO'XTATILDI/,
    );
    expect(() => pruefeDialogBudget(BELGI_CHEGARASI_DIALOG)).not.toThrow();
  });
});
