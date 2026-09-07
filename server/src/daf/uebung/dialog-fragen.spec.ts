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

  // `rndId`da olib tashlanadigan satr HAR DOIM id=11 ("Ja, ich bin Mia.
  // Und du?") — pastdagi ikkala nomzod ATAYLAB shundan BOSHQA satrga
  // (id=10/id=12) mos qilib tanlangan, shunda ular richtigga tenglik
  // orqali emas, FAQAT "shu dialogning gapi" tekshiruvi orqali chetlanadi.
  it('chalg`ituvchi ORASIDA shu dialogning satri (id yoki matn orqali) bo`lsa, u chiqib ketadi', () => {
    // (1) — dialogning O'ZINING birinchi satri, xuddi shu id bilan.
    const ozIdOrqali = z(10, 'Jonas', 'Hallo! Bist du Mia?');
    // (2) — BOSHQA id, lekin MATNI dialogning uchinchi satriga (id 12)
    // so'zma-so'z teng — chaqiruvchi ularni chetlab o'tishni unutgan
    // holat, faqat matn orqali aniqlanadigan holat.
    const ozMatnOrqali = z(777, 'X', 'Ich bin Jonas.');

    const f = dialogLuecke(
      dialog,
      [ozIdOrqali, ozMatnOrqali, ...andere],
      rndId,
    )!;
    expect(f.options).not.toContain('Hallo! Bist du Mia?');
    expect(f.options).not.toContain('Ich bin Jonas.');
  });

  // Finding (ko`rik): richtigdan FAQAT tinish belgisi bilan farq
  // qiladigan nomzod ham chalg`ituvchi bo`lmasligi kerak — aks holda
  // ikkita "to'g'ri" variant chiqib qolardi (`wort-fragen.spec.ts`dagi
  // xuddi shu himoyaning testi bilan bir xil sabab).
  it('richtigdan FAQAT tinish belgisi bilan farq qiladigan nomzod chalg`ituvchi bo`lmaydi', () => {
    // rndId bilan olib tashlanadigan satr — id=11, "Ja, ich bin Mia. Und du?".
    const tinishFarqli = z(888, 'Y', 'Ja, ich bin Mia. Und du');
    const f = dialogLuecke(dialog, [tinishFarqli, ...andere], rndId)!;
    expect(f.richtig).toBe('Ja, ich bin Mia. Und du?');
    expect(f.options).not.toContain('Ja, ich bin Mia. Und du');
  });
});
