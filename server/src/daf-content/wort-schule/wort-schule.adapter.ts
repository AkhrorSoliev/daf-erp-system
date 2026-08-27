import type { AssetRef } from '../dataset.types';
import type { DafSourceAdapter } from '../adapter.types';
import { WortSchuleClient } from './wort-schule-client';
import { parseWordJson, type WordSchuleEntry } from './wort-schule.parser';

export interface WsRaw {
  lemma: string;
  json: string;
}

/**
 * `wort.schule` adapteri — `DafSourceAdapter` ni amalga oshiradigan BIRINCHI
 * sinf. Interfeys Faza 1 da ta'riflangan-u, hech kim unga qurilmagan edi;
 * ikki mavjud adapter esa shu sababdan bir-biridan uzoqlashib ketgan.
 *
 * Lemmalar tashqaridan beriladi: adapter qaysi so'z kerakligini o'zi
 * bilmaydi, uni chaqiruvchi datasetdan oladi.
 */
export class WortSchuleAdapter implements DafSourceAdapter<
  WsRaw,
  WordSchuleEntry | null
> {
  readonly source = 'WORT_SCHULE' as const;

  constructor(
    private readonly lemmas: string[],
    private readonly client: WortSchuleClient,
  ) {}

  async *harvest(): AsyncIterable<WsRaw> {
    for (const lemma of this.lemmas) {
      const json = await this.client.fetchWord(lemma);
      if (json) yield { lemma, json };
    }
  }

  map(raw: WsRaw): WordSchuleEntry | null {
    return parseWordJson(raw.json, raw.lemma);
  }

  assets(raw: WsRaw): AssetRef[] {
    const entry = this.map(raw);
    return entry?.image ? [entry.image] : [];
  }
}
