/**
 * `content/daf/jang/*.json` tekshiruvi (spec §4). Seed ham, fayl testi ham
 * shuni chaqiradi — xato fayl bazaga tushmaydi.
 */
export interface JangSavolFayli {
  level: 'A1';
  order: number;
  tasdiqlangan: boolean;
  savollar: Array<{
    id: string;
    kind: 'CHOOSE' | 'TYPE' | 'LISTEN';
    prompt: string;
    options?: string[];
    answer: string;
    akzeptiert?: string[];
    lexeme?: string;
  }>;
}

const MIN = 30;
const MAX = 40;

export function jangFayliXatolari(
  f: JangSavolFayli,
  eshitish: Record<string, number>,
): string[] {
  const x: string[] = [];
  const n = f.savollar.length;
  if (n < MIN || n > MAX) x.push(`savollar soni ${n}, kerak ${MIN}–${MAX}`);
  const prefiks = `jang-${f.level.toLowerCase()}-u${String(f.order).padStart(2, '0')}-`;
  const idlar = new Set<string>();
  let choose = 0;
  let listen = 0;
  for (const s of f.savollar) {
    if (!s.id.startsWith(prefiks) || !/-\d{3}$/.test(s.id))
      x.push(`${s.id}: id ${prefiks}NNN shaklida emas`);
    if (idlar.has(s.id)) x.push(`${s.id}: takror id`);
    idlar.add(s.id);
    if (!s.prompt.trim() || !s.answer.trim())
      x.push(`${s.id}: bo'sh savol yoki javob`);
    if (s.kind === 'TYPE') {
      if (s.options?.length)
        x.push(`${s.id}: yozish savolida variant bo'lmaydi`);
      if (/\s/.test(s.answer.trim()))
        x.push(`${s.id}: yozish javobi bitta so'z bo'lsin`);
    } else {
      const o = s.options ?? [];
      if (o.length < 3 || o.length > 4 || new Set(o).size !== o.length)
        x.push(`${s.id}: 3–4 ta har xil variant kerak`);
      if (!o.includes(s.answer))
        x.push(`${s.id}: javob variantlar ichida yo'q`);
      if (s.kind === 'CHOOSE') choose += 1;
    }
    if (s.kind === 'LISTEN') {
      listen += 1;
      if (!s.lexeme || !(s.lexeme in eshitish))
        x.push(`${s.id}: eshitish so'zi ≤3000 ms ro'yxatida yo'q`);
    }
  }
  if (n && choose / n < 0.4)
    x.push(`tanlash ulushi ${Math.round((choose / n) * 100)}%, kamida 40%`);
  if (n && listen / n > 0.2)
    x.push(`eshitish ulushi ${Math.round((listen / n) * 100)}%, ko'pi 20%`);
  return x;
}
