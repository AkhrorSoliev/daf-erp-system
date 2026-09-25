import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  geminiDialog,
  gesamtZeichenDialoge,
  pruefeDialogBudget,
  zuGenerierenDialoge,
  parseAuswahl,
  generiereDialogeNacheinander,
  erstelleGeneriere,
  BELGI_CHEGARASI_DIALOG,
  DIALOG_STIL_ZUSATZ,
  ABLEHNUNG_VERSUCHE,
  type DialogRegie,
} from './daf-gen-dialog-audio';
import {
  DIALOG_AUDIO_MODELL,
  dialogTextHash,
} from '../src/daf/inhalt/dialog-audio';
import { POLSTER_KENNUNG } from '../src/daf/media/audio-polster';
import { FalAblehnungError } from '../src/daf/media/fal-client';
import type { Dialog, DialogeFile } from '../src/daf/inhalt/unit-inhalt.types';
import type { DialogAudioManifest } from '../src/daf/inhalt/dialog-audio';

const stimmen = { Anna: 'Erinome', Jonas: 'Iapetus', Julia: 'Callirrhoe' };

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

const regieFuer = (...ids: string[]): DialogRegie =>
  Object.fromEntries(
    ids.map((id) => [
      id,
      { szene: 'Zwei Freunde im Park.', toene: ['curious', null] },
    ]),
  );

describe('geminiDialog', () => {
  it('builds one request: speaker prefixes, tags, tts ?? de, each speaker once, scene plus the fixed pace note', () => {
    expect(geminiDialog(d('u02-d2'), stimmen, regieFuer('u02-d2'))).toEqual({
      prompt: 'Anna: [curious] Ist das deine Schwester?\nJonas: Nain.',
      speakers: [
        { speakerId: 'Anna', voice: 'Erinome' },
        { speakerId: 'Jonas', voice: 'Iapetus' },
      ],
      styleInstructions: `Zwei Freunde im Park. ${DIALOG_STIL_ZUSATZ}`,
    });
  });

  it('stops on a speaker with no voice — there is no default voice', () => {
    expect(() =>
      geminiDialog(d('u02-d2'), { Anna: 'Erinome' }, regieFuer('u02-d2')),
    ).toThrow(/Jonas.*stimmen\.json/);
  });

  it('stops when two speakers of one dialog share a voice — the listener could not tell them apart', () => {
    expect(() =>
      geminiDialog(
        d('u02-d2'),
        { Anna: 'Erinome', Jonas: 'Erinome' },
        regieFuer('u02-d2'),
      ),
    ).toThrow(/Anna.*Jonas.*Erinome/);
  });

  it('stops when the dialog has no scene direction', () => {
    expect(() => geminiDialog(d('u02-d2'), stimmen, {})).toThrow(
      /u02-d2.*dialog-regie\.json/,
    );
  });

  it('stops when the tones do not match the lines one to one', () => {
    const regie = { 'u02-d2': { szene: 'x', toene: ['curious'] } };
    expect(() => geminiDialog(d('u02-d2'), stimmen, regie)).toThrow(
      /u02-d2.*2 satr.*1 ta/,
    );
  });

  // A tag is a delivery direction in English; a German word or a bracket
  // inside it could be read out loud.
  it('stops on a tone that is not plain lowercase English words', () => {
    for (const ton of ['fröhlich', 'Curious', 'curious]', 'a  b', '']) {
      const regie = { 'u02-d2': { szene: 'x', toene: [ton, null] } };
      expect(() => geminiDialog(d('u02-d2'), stimmen, regie)).toThrow(/ton/);
    }
  });

  it('stops on a one-speaker dialog — the dialogue mode needs two voices', () => {
    const allein: Dialog = { ...d('u02-d9'), zeilen: [d('x').zeilen[0]] };
    const regie = { 'u02-d9': { szene: 'x', toene: [null] } };
    expect(() => geminiDialog(allein, stimmen, regie)).toThrow(
      /2 ta gapiruvchi/,
    );
  });

  it('stops on a speaker name the model cannot use as a prefix', () => {
    const dialog: Dialog = {
      ...d('u02-d2'),
      zeilen: [
        { sprecher: 'Frau Weber', de: 'Hallo!', uz: 'x' },
        { sprecher: 'Jonas', de: 'Hallo!', uz: 'x' },
      ],
    };
    expect(() =>
      geminiDialog(
        dialog,
        { 'Frau Weber': 'Erinome', Jonas: 'Iapetus' },
        regieFuer('u02-d2'),
      ),
    ).toThrow(/Frau Weber/);
  });
});

describe('zuGenerierenDialoge', () => {
  it('skips a dialog whose text and model already match — rerunning costs nothing', () => {
    const a = d('u02-d1');
    const manifest = {
      'u02-d1': {
        key: 'daf/audio/a.mp3',
        textHash: dialogTextHash(a.zeilen),
        modell: DIALOG_AUDIO_MODELL,
      },
    };
    expect(
      zuGenerierenDialoge([a, d('u02-d2')], manifest).map((x) => x.id),
    ).toEqual(['u02-d2']);
  });

  it('remakes a dialog whose text changed', () => {
    const a = d('u02-d1');
    const manifest = {
      'u02-d1': {
        key: 'daf/audio/a.mp3',
        textHash: '0000',
        modell: DIALOG_AUDIO_MODELL,
      },
    };
    expect(zuGenerierenDialoge([a], manifest).map((x) => x.id)).toEqual([
      'u02-d1',
    ]);
  });

  // CEO 2026-09-25: no mixed models. An entry from before the switch has no
  // `modell` (ElevenLabs), so it is remade even though its text is current.
  it('remakes a dialog voiced by another model', () => {
    const a = d('u02-d1');
    const eski = { key: 'daf/audio/a.mp3', textHash: dialogTextHash(a.zeilen) };
    expect(
      zuGenerierenDialoge([a], { 'u02-d1': eski }).map((x) => x.id),
    ).toEqual(['u02-d1']);
    expect(
      zuGenerierenDialoge([a], {
        'u02-d1': { ...eski, modell: 'boshqa/model' },
      }).map((x) => x.id),
    ).toEqual(['u02-d1']);
  });

  // F1 ikkinchi qatlami (2026-09-12 ko'rik): argument tahlili qatlamidan
  // qat'i nazar, RO'YXATNING O'ZIDA bir xil `id` ikki marta kelib qolsa
  // ham generatsiyaga faqat BITTASI yuborilishi kerak — aks holda bitta
  // dialog ikki marta PULLIK yasalardi.
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
  const anfragen = (...ds: Dialog[]) =>
    new Map(ds.map((x) => [x.id, geminiDialog(x, stimmen, regieFuer(x.id))]));

  // F2 (2026-09-12 ko'rik): o'rtadagi bitta dialog yiqilsa, undan OLDINGI
  // PULLIK yasalgan dialoglarning kaliti manifestda QOLISHI shart.
  it('bitta dialog yiqilsa — undan OLDINGI dialogning kaliti manifestda QOLADI', async () => {
    const a = d('u02-d1');
    const b = d('u02-d2');
    const manifest: DialogAudioManifest = {};
    const generiere = jest
      .fn()
      .mockResolvedValueOnce({ key: 'daf/audio/birinchi.mp3' })
      .mockRejectedValueOnce(new Error('R2 yiqildi'));
    const speichereManifest = jest.fn();

    await expect(
      generiereDialogeNacheinander(
        [a, b],
        anfragen(a, b),
        manifest,
        generiere,
        speichereManifest,
      ),
    ).rejects.toThrow(/R2 yiqildi/);

    expect(manifest[a.id]).toEqual({
      key: 'daf/audio/birinchi.mp3',
      textHash: dialogTextHash(a.zeilen),
      modell: DIALOG_AUDIO_MODELL,
    });
    expect(manifest[b.id]).toBeUndefined();
    expect(speichereManifest).toHaveBeenCalledTimes(1);
    expect(speichereManifest).toHaveBeenCalledWith(manifest);
  });

  it('hands each dialog its own request and saves after every one', async () => {
    const a = d('u02-d1');
    const b = d('u02-d2');
    const manifest: DialogAudioManifest = {};
    const byId = anfragen(a, b);
    const generiere = jest
      .fn()
      .mockResolvedValueOnce({
        key: 'daf/audio/a.mp3',
        polster: POLSTER_KENNUNG,
      })
      .mockResolvedValueOnce({
        key: 'daf/audio/b.mp3',
        polster: POLSTER_KENNUNG,
      });
    const speichereManifest = jest.fn();

    await generiereDialogeNacheinander(
      [a, b],
      byId,
      manifest,
      generiere,
      speichereManifest,
    );

    expect(generiere).toHaveBeenNthCalledWith(1, a, byId.get(a.id));
    expect(generiere).toHaveBeenNthCalledWith(2, b, byId.get(b.id));
    expect(manifest[b.id]).toEqual({
      key: 'daf/audio/b.mp3',
      textHash: dialogTextHash(b.zeilen),
      polster: POLSTER_KENNUNG,
      modell: DIALOG_AUDIO_MODELL,
    });
    expect(speichereManifest).toHaveBeenCalledTimes(2);
  });
});

// Bitta dialog uchun to'liq quvur — fal → yuklab oladi → jimlik qo'shadi →
// YANGI kalit bilan yuklaydi. Hammasi soxta, tarmoqqa chiqilmaydi.
describe('erstelleGeneriere', () => {
  const okFetch = () =>
    jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
  const anfrage = geminiDialog(d('u02-d2'), stimmen, regieFuer('u02-d2'));

  it('fal → yuklab oladi → jimlik qo`shadi → YANGI kalit bilan yuklaydi, natijada polster bor', async () => {
    const fal = {
      dialogGemini: jest.fn().mockResolvedValue('https://fal.ai/x.mp3'),
    };
    const fetchFn = okFetch();
    const polster = jest.fn().mockResolvedValue(Buffer.from([9, 9]));
    const uploadBytes = jest.fn().mockResolvedValue(undefined);

    const generiere = erstelleGeneriere(
      fal as never,
      { uploadBytes } as never,
      fetchFn as never,
      polster,
    );
    const result = await generiere(d('u02-d2'), anfrage);

    expect(fal.dialogGemini).toHaveBeenCalledWith(anfrage);
    expect(fetchFn).toHaveBeenCalledWith('https://fal.ai/x.mp3');
    expect(polster).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(uploadBytes).toHaveBeenCalledTimes(1);
    const [yangiKalit, yuklanganBaytlar] = uploadBytes.mock.calls[0];
    expect(yuklanganBaytlar).toEqual(Buffer.from([9, 9]));
    expect(typeof yangiKalit).toBe('string');
    expect(result).toEqual({ key: yangiKalit, polster: POLSTER_KENNUNG });
  });

  // Gemini's content checker refuses plain German at random (2026-09-25:
  // "dann" twice, then accepted). A refusal costs nothing, so the same
  // request is simply sent again, a few times, and nothing else is retried.
  it('asks again after a content-checker refusal', async () => {
    const fal = {
      dialogGemini: jest
        .fn()
        .mockRejectedValueOnce(new FalAblehnungError('rad'))
        .mockRejectedValueOnce(new FalAblehnungError('rad'))
        .mockResolvedValueOnce('https://fal.ai/x.mp3'),
    };
    const generiere = erstelleGeneriere(
      fal as never,
      { uploadBytes: jest.fn() } as never,
      okFetch() as never,
      jest.fn().mockResolvedValue(Buffer.from([9])),
    );
    await generiere(d('u02-d2'), anfrage);
    expect(fal.dialogGemini).toHaveBeenCalledTimes(3);
  });

  it(`gives up after ${ABLEHNUNG_VERSUCHE} refusals, and never retries any other error`, async () => {
    const rad = {
      dialogGemini: jest.fn().mockRejectedValue(new FalAblehnungError('rad')),
    };
    await expect(
      erstelleGeneriere(
        rad as never,
        { uploadBytes: jest.fn() } as never,
        okFetch() as never,
        jest.fn(),
      )(d('u02-d2'), anfrage),
    ).rejects.toBeInstanceOf(FalAblehnungError);
    expect(rad.dialogGemini).toHaveBeenCalledTimes(ABLEHNUNG_VERSUCHE);

    const xato = {
      dialogGemini: jest
        .fn()
        .mockRejectedValue(new Error('fal.ai javob bermadi (500)')),
    };
    await expect(
      erstelleGeneriere(
        xato as never,
        { uploadBytes: jest.fn() } as never,
        okFetch() as never,
        jest.fn(),
      )(d('u02-d2'), anfrage),
    ).rejects.toThrow(/500/);
    expect(xato.dialogGemini).toHaveBeenCalledTimes(1);
  });

  it('fal audiosi yuklab olinmasa (HTTP xato), TO`XTAYDI — jimlik va yuklash chaqirilmaydi', async () => {
    const fal = {
      dialogGemini: jest.fn().mockResolvedValue('https://fal.ai/x.mp3'),
    };
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const polster = jest.fn();
    const uploadBytes = jest.fn();

    const generiere = erstelleGeneriere(
      fal as never,
      { uploadBytes } as never,
      fetchFn as never,
      polster,
    );

    await expect(generiere(d('u02-d2'), anfrage)).rejects.toThrow(/HTTP 500/);
    expect(polster).not.toHaveBeenCalled();
    expect(uploadBytes).not.toHaveBeenCalled();
  });
});

describe('budjet', () => {
  it('counts every billed character: the prompt and the style instructions', () => {
    const anfrage = geminiDialog(d('x'), stimmen, regieFuer('x'));
    expect(gesamtZeichenDialoge([anfrage, anfrage])).toBe(
      2 * (anfrage.prompt.length + anfrage.styleInstructions.length),
    );
  });

  it('chegaradan oshsa chaqiruvdan OLDIN to`xtaydi', () => {
    expect(() => pruefeDialogBudget(BELGI_CHEGARASI_DIALOG + 1)).toThrow(
      /TO'XTATILDI/,
    );
    expect(() => pruefeDialogBudget(BELGI_CHEGARASI_DIALOG)).not.toThrow();
  });
});

// The real course files: every dialog must have voices and a scene
// direction before a paid run starts, not fail halfway through it.
describe('course content fits the Gemini request', () => {
  const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
  const read = <T>(...p: string[]) =>
    JSON.parse(readFileSync(join(A1, ...p), 'utf8')) as T;

  it('builds a request for every dialog of every unit', () => {
    const units = readdirSync(A1).filter(
      (u) => /^u\d\d$/.test(u) && existsSync(join(A1, u, 'dialoge.json')),
    );
    const dialoge = units.flatMap(
      (u) => read<DialogeFile>(u, 'dialoge.json').dialoge,
    );
    expect(dialoge.length).toBeGreaterThan(0);
    const stimmenDatei = read<Record<string, string>>('stimmen.json');
    const regie = read<DialogRegie>('dialog-regie.json');
    for (const dialog of dialoge) {
      expect(() => geminiDialog(dialog, stimmenDatei, regie)).not.toThrow();
    }
  });
});
