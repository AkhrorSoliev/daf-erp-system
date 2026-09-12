import {
  dialogInputs,
  gesamtZeichenDialoge,
  pruefeDialogBudget,
  zuGenerierenDialoge,
  parseAuswahl,
  generiereDialogeNacheinander,
  BELGI_CHEGARASI_DIALOG,
} from './daf-gen-dialog-audio';
import { dialogTextHash } from '../src/daf/inhalt/dialog-audio';
import type { Dialog } from '../src/daf/inhalt/unit-inhalt.types';
import type { DialogAudioManifest } from '../src/daf/inhalt/dialog-audio';

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

  // F1 ikkinchi qatlami (2026-09-12 ko'rik): argument tahlili qatlamidan
  // qat'i nazar, RO'YXATNING O'ZIDA bir xil `id` ikki marta kelib qolsa
  // ham (masalan boshqa bir tanlov yo'li orqali) generatsiyaga faqat
  // BITTASI yuborilishi kerak — aks holda bitta dialog ikki marta PULLIK
  // yasalardi va manifestda faqat oxirgi kalit qolib, birinchisi R2'da
  // yetim bo'lib qolardi.
  it('ro`yxatda bir xil `id` ikki marta kelsa — faqat BITTASI qoladi', () => {
    const ikkitaBirXil = [d('u02-d2'), d('u02-d2')];
    expect(zuGenerierenDialoge(ikkitaBirXil, {}).map((x) => x.id)).toEqual([
      'u02-d2',
    ]);
  });
});

describe('parseAuswahl', () => {
  it('takroriy `--unit` bitta tanlovga tushadi — dublikat YO`Q', () => {
    expect(parseAuswahl(['--unit', '2', '--unit', '2']).units).toEqual(['u02']);
  });

  it('takroriy `--dialog` bitta tanlovga tushadi — dublikat YO`Q', () => {
    expect(
      parseAuswahl(['--dialog', 'u02-d2', '--dialog', 'u02-d2']).dialoge,
    ).toEqual(['u02-d2']);
  });

  it('`--dialog` o`z unitini o`zi bilan olib keladi', () => {
    expect(parseAuswahl(['--dialog', 'u02-d2'])).toEqual({
      units: ['u02'],
      dialoge: ['u02-d2'],
    });
  });

  it('ikkala bayroq ham yo`q bo`lsa yiqiladi', () => {
    expect(() => parseAuswahl([])).toThrow(/Kerak: --unit .* yoki --dialog/);
  });
});

describe('generiereDialogeNacheinander', () => {
  // F2 (2026-09-12 ko'rik): ilgari BUTUN partiya tugagandan keyin bitta
  // manifest yozuvi bo'lgan — o'rtadagi bitta dialog yiqilsa, undan
  // OLDINGI muvaffaqiyatli (PULLIK) yasalgan dialoglarning kaliti
  // hech qayerga yozilmay yo'qolardi, va keyingi yuritish ularni QAYTA
  // to'lardi. Bu test buni dalillaydi: ikkinchi dialog yiqilganda ham
  // birinchisining kaliti manifestda TURADI.
  it('bitta dialog yiqilsa — undan OLDINGI dialogning kaliti manifestda QOLADI', async () => {
    const a = d('u02-d1');
    const b = d('u02-d2');
    const manifest: DialogAudioManifest = {};
    const inputsById = new Map([
      [a.id, dialogInputs(a, stimmen)],
      [b.id, dialogInputs(b, stimmen)],
    ]);
    const generiere = jest
      .fn()
      .mockResolvedValueOnce({ key: 'daf/audio/birinchi.mp3' })
      .mockRejectedValueOnce(new Error('R2 yiqildi'));
    const speichereManifest = jest.fn();

    await expect(
      generiereDialogeNacheinander(
        [a, b],
        inputsById,
        manifest,
        generiere,
        speichereManifest,
      ),
    ).rejects.toThrow(/R2 yiqildi/);

    expect(manifest[a.id]).toEqual({
      key: 'daf/audio/birinchi.mp3',
      textHash: dialogTextHash(a.zeilen),
    });
    expect(manifest[b.id]).toBeUndefined();
    // Diskka faqat MUVAFFAQIYATLI yozuvdan keyin saqlangan — bitta marta.
    expect(speichereManifest).toHaveBeenCalledTimes(1);
    expect(speichereManifest).toHaveBeenCalledWith(manifest);
  });

  it('hammasi muvaffaqiyatli bo`lsa — har biridan keyin saqlaydi', async () => {
    const a = d('u02-d1');
    const b = d('u02-d2');
    const manifest: DialogAudioManifest = {};
    const inputsById = new Map([
      [a.id, dialogInputs(a, stimmen)],
      [b.id, dialogInputs(b, stimmen)],
    ]);
    const generiere = jest
      .fn()
      .mockResolvedValueOnce({ key: 'daf/audio/a.mp3' })
      .mockResolvedValueOnce({ key: 'daf/audio/b.mp3' });
    const speichereManifest = jest.fn();

    await generiereDialogeNacheinander(
      [a, b],
      inputsById,
      manifest,
      generiere,
      speichereManifest,
    );

    expect(manifest[a.id]?.key).toBe('daf/audio/a.mp3');
    expect(manifest[b.id]?.key).toBe('daf/audio/b.mp3');
    expect(speichereManifest).toHaveBeenCalledTimes(2);
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
