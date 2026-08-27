/**
 * Grimm Grammar sahifasidagi MASHQ TO'PLAMLARI.
 *
 * Nega bu alohida modul: mashqlar avval sahifadagi `<table class="ex">`
 * bloklaridan o'qilardi, ya'ni tartibsiz belgidan. Interaktiv sahifada esa
 * har bir mashq to'plami o'z FORMASIGA o'ralgan va o'z tekshirgichini
 * chaqiradi:
 *
 *   <form name="no_02_01_fib"
 *         onsubmit="proc_post('/gg/ex_set_proc.php?ec=no_02_01_fib',
 *                             '1','es_01_fib','no_02_01_fib','fib','25')">
 *
 * Bu chaqiruv ikki narsani beradi, va ikkalasi ham bizga kerak:
 *
 *   1. `ec` — to'plam kodi. Javob kaliti shu kod bilan olinadi.
 *   2. oxirgi argument — to'plamdagi SAVOLLAR SONI. Ya'ni manba o'zi
 *      nechta javob kutish kerakligini aytadi.
 *
 * Ikkinchisi tekshiruvga aylanadi: sahifadan o'qilgan savollar soni shu
 * songa teng bo'lmasa, yig'ish to'xtaydi. Bu qoida bo'lmagani uchun 256 ta
 * mashq (manbadagi 1 306 tadan) jimgina yo'qolgan edi — bo'sh natija
 * xatoga o'xshamaydi, shuning uchun uni hech kim ushlamagan.
 */

export interface ExerciseSet {
  /** Tekshirgich kodi, masalan `no_02_01_fib`. */
  code: string;
  /** `fib` (bo'sh joy va tartiblash), `mcr` (variant tanlash), `dd` (surish). */
  type: string;
  /** Manba e'lon qilgan savollar soni — kutilgan javoblar soni. */
  count: number;
  /** Shu to'plamning formasi ichidagi HTML. */
  html: string;
}

const PROC_POST_RE =
  /proc_post\('[^']*\?ec=([^']+)','[^']*','[^']*','[^']*','([^']*)','(\d+)'\)/;

/**
 * Sahifadagi har bir mashq to'plamini qaytaradi. Formasi yoki `proc_post`
 * chaqiruvi bo'lmagan blok to'plam emas — u o'qilmaydi.
 */
export function parseExerciseSets(html: string): ExerciseSet[] {
  const sets: ExerciseSet[] = [];
  const FORM_OPEN = /<form\b[^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = FORM_OPEN.exec(html))) {
    const proc = PROC_POST_RE.exec(m[0]);
    if (!proc) continue;

    const bodyStart = m.index + m[0].length;
    const close = html.indexOf('</form>', bodyStart);
    sets.push({
      code: proc[1],
      type: proc[2],
      count: Number(proc[3]),
      html: html.slice(bodyStart, close === -1 ? html.length : close),
    });
  }

  return sets;
}
