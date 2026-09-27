/**
 * The A1 picture style the CEO chose on 2026-09-27 from two samples: B,
 * flat. Kept word for word so every picture of the course looks the same;
 * the samples were drawn with exactly this text.
 */
const STIL =
  'Flat vector illustration with bold simple shapes, clean thick outlines ' +
  'and bright friendly colors: {szene}. Minimal detail, plain light ' +
  'background, subject centered and filling most of the frame. No text, no ' +
  'letters, no words, no writing, no signs anywhere.';

export function bildPrompt(szene: string): string {
  const s = szene.trim();
  if (!s) throw new Error("Rasm sahnasi bo'sh");
  return STIL.replace('{szene}', s);
}
