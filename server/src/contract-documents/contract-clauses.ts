import { NotFoundException } from '@nestjs/common';
import { BODY_SECTIONS } from './pdf/contract-template-v1';

export interface ContractClause {
  /** "3.2" */
  no: string;
  /** Bandning matni, raqamsiz. */
  text: string;
}

/**
 * Shartnoma bandlarini tizimdagi eng so'nggi shablondan (ADR-0075,
 * `contract-template-v1.ts`) ajratib beradi. Admin ekranlaridagi
 * «Shartnoma 3.2» havolasi (ADR-0142) shu matnni ko'rsatadi, ya'ni o'quvchi
 * imzolagan matn bilan bir xil: ikkinchi nusxa yo'q.
 *
 * Band shablonda "3.2. Matn..." ko'rinishida turadi. Raqam nuqta va
 * bo'sh joy bilan to'liq mos kelishi kerak, shuning uchun "3.2" "3.20" ni
 * olmaydi.
 */
export function clausesFromTemplate(nos: string[]): ContractClause[] {
  const items = BODY_SECTIONS.flatMap((s) => s.items);
  const seen = new Set<string>();
  const out: ContractClause[] = [];
  for (const no of nos) {
    if (seen.has(no)) continue;
    seen.add(no);
    const prefix = `${no}. `;
    const item = items.find((i) => i.startsWith(prefix));
    if (!item) {
      throw new NotFoundException(`Shartnomada ${no}-band topilmadi`);
    }
    out.push({ no, text: item.slice(prefix.length).trim() });
  }
  return out;
}
