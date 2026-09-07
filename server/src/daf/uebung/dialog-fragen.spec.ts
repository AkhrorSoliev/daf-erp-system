import { dialogLuecke } from './dialog-fragen';
import type { MaterialDialog, MaterialDialogZeile } from './frage.types';

const z = (id: number, sprecher: string, de: string): MaterialDialogZeile => ({
  id,
  sprecher,
  de,
  uz: `${de} (uz)`,
});

const dialog: MaterialDialog = {
  id: 1,
  titelDe: 'Bist du Mia?',
  sectionCode: 'u01-s1',
  zeilen: [
    z(10, 'Jonas', 'Hallo! Bist du Mia?'),
    z(11, 'Mia', 'Ja, ich bin Mia. Und du?'),
    z(12, 'Jonas', 'Ich bin Jonas.'),
    z(13, 'Mia', 'Freut mich!'),
  ],
};

const andere = [
  z(20, 'A', 'Guten Abend!'),
  z(21, 'B', 'Nein, danke.'),
  z(22, 'C', 'Ich wohne in Berlin.'),
  z(23, 'D', 'Wie heißen Sie?'),
];

// `() => 0` chap-aylanma beradi, ayniqsatlik EMAS.
const rndId = () => 0.9999;

describe('dialogLuecke', () => {
  it('savol quradi va to`rtta variant beradi', () => {
    const f = dialogLuecke(dialog, andere, rndId)!;
    expect(f).not.toBeNull();
    expect(f.format).toBe('DIALOG_LUECKE');
    expect(f.itemType).toBe('DIALOGZEILE');
    expect(f.options).toHaveLength(4);
    expect(f.options).toContain(f.richtig);
  });

  it('BIRINCHI satrni olib tashlamaydi', () => {
    // Usiz suhbat kontekstsiz qoladi va topshiriq taxminga aylanadi.
    for (let i = 0; i < 30; i += 1) {
      const f = dialogLuecke(dialog, andere, () => i / 30)!;
      expect(f.richtig).not.toBe('Hallo! Bist du Mia?');
    }
  });

  it('savolning o`zligi — olib tashlangan SATR', () => {
    const f = dialogLuecke(dialog, andere, rndId)!;
    const zeile = dialog.zeilen.find((x) => x.de === f.richtig)!;
    expect(f.itemId).toBe(zeile.id);
  });

  it('promptda suhbat bor va bo`sh joy belgilangan', () => {
    const f = dialogLuecke(dialog, andere, rndId)!;
    expect(f.prompt).toContain('Jonas');
    expect(f.prompt).toContain('___');
    expect(f.prompt).not.toContain(f.richtig);
  });

  it('chalg`ituvchi shu dialogning satri BO`LMAYDI', () => {
    const f = dialogLuecke(dialog, andere, rndId)!;
    const oz = new Set(dialog.zeilen.map((x) => x.de));
    const chalgituvchi = f.options.filter((o) => o !== f.richtig);
    expect(chalgituvchi.filter((o) => oz.has(o))).toEqual([]);
  });

  it('to`rt satrdan kam dialogdan savol qurilmaydi', () => {
    const qisqa: MaterialDialog = {
      ...dialog,
      zeilen: dialog.zeilen.slice(0, 3),
    };
    expect(dialogLuecke(qisqa, andere, rndId)).toBeNull();
  });

  it('uchta chalg`ituvchi topilmasa null', () => {
    expect(dialogLuecke(dialog, andere.slice(0, 2), rndId)).toBeNull();
  });

  it('bir xil matnli chalg`ituvchi ikki marta tushmaydi', () => {
    const takror = [...andere, z(24, 'E', 'Guten Abend!')];
    const f = dialogLuecke(dialog, takror, rndId)!;
    expect(new Set(f.options).size).toBe(f.options.length);
  });
});
