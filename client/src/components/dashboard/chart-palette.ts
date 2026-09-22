/**
 * Diagrammalar palitrasi.
 *
 * NEGA LITERAL HEX VA JS ORQALI: CLAUDE.md SVG atributlarida
 * `hsl(var(--…))` ni taqiqlaydi — u SVG'da jimgina ishlamaydi va sukut
 * bo'yicha QORA rang beradi (tooltip kursori qorayib qolgan xato shundan
 * kelib chiqqan). Recharts esa ranglarni SVG atributi sifatida qo'yadi.
 * Shuning uchun rang JS'da tanlanadi va literal hex bo'lib beriladi.
 *
 * QIYMATLAR TAXMIN QILINMAGAN: bular `dataviz` skill'ining tekshirilgan
 * kategorik palitrasining 1–3 slotlari. Skript bilan sinaldi
 * (`validate_palette.js`), ikkala rejimda ham hamma tekshiruv o'tdi:
 *
 *   yorug'   — eng yomon qo'shni juftlik CVD ΔE 9.2, oddiy ko'rish ΔE 27.6
 *   qorong'i — CVD ΔE 9.4, oddiy ko'rish ΔE 26.5
 *
 * Yorug' rejimda akvamarin rangning fon bilan kontrasti 3:1 dan past (2.74),
 * shuning uchun skript «ko'rinadigan yorliq shart» deb ogohlantiradi — aynan
 * shu sababli har bir diagrammada legenda majburiy va rang yolg'iz o'zi
 * ma'no tashimaydi.
 *
 * Uchtadan ortiq seriya QO'SHILMASIN: to'rtinchi slot (sariq) apelsin bilan
 * yonma-yon tushadi va tekshiruvdan o'tmaydi.
 */

export interface ChartPalette {
  /** 1-slot, ko'k — asosiy seriya. */
  series1: string;
  /** 2-slot, apelsin. */
  series2: string;
  /** 3-slot, akvamarin. */
  series3: string;
  /** O'q, tur chizig'i va yorliqlar uchun bo'sh rang. */
  axis: string;
  grid: string;
}

const LIGHT: ChartPalette = {
  series1: '#2a78d6',
  series2: '#eb6834',
  series3: '#1baf7a',
  axis: '#64748b',
  grid: 'rgba(100, 116, 139, 0.15)',
};

const DARK: ChartPalette = {
  series1: '#3987e5',
  series2: '#d95926',
  series3: '#199e70',
  axis: '#94a3b8',
  grid: 'rgba(148, 163, 184, 0.15)',
};

export function chartPalette(isDark: boolean): ChartPalette {
  return isDark ? DARK : LIGHT;
}
