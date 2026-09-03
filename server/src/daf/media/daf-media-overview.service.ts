import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface PersonaStimme {
  engine: string;
  voice: string;
  label: string;
  hz: number;
  dialogfaehig: boolean;
}
export interface PersonaRow {
  id: string;
  vorname: string;
  nachname: string;
  alter: number;
  geschlecht: 'w' | 'm';
  stadt: string;
  land: string;
  sprachen: string[];
  beruf: string;
  stimme: PersonaStimme;
  portrait: string;
  probe: string;
}
export interface GeneratedAsset {
  key: string;
  kind: 'AUDIO' | 'VIDEO' | 'IMAGE' | 'PDF';
  bytes: number;
  sha256: string;
  /** Sahifadagi bo'lim: `persona` | `einheit` | `sendung` | `sonstiges`. */
  bereich: string;
  niveau: string | null;
  einheit: string | null;
  titel: string;
  quelle: string;
  lizenz: string;
}

/** Sahifa uchun bitta aktiv — havolasi bilan. */
export interface MediaAsset extends Omit<GeneratedAsset, 'quelle' | 'lizenz'> {
  url: string | null;
}

export interface MediaOverview {
  personas: (Omit<PersonaRow, 'portrait' | 'probe'> & {
    portraitUrl: string | null;
    probeUrl: string | null;
  })[];
  /** Hamma aktiv — sahifa filtrlarini shu ro'yxat oziqlantiradi. */
  alle: MediaAsset[];
  nachArt: { kind: string; anzahl: number; bytes: number }[];
  nachBereich: { bereich: string; anzahl: number; bytes: number }[];
  summe: { anzahl: number; bytes: number };
  /** Kontent fayllari topilmasa `false` — sahifa bo'sh emas, sababini aytadi. */
  vorhanden: boolean;
}

/**
 * Media bo'limi uchun faqat O'QISH xizmati.
 *
 * Ma'lumot Prisma'dan emas, `content/daf/*.json` dan olinadi. Sabab: obrazlar
 * hozircha faqat kontent yig'ish quvurida yashaydi va bazaga hech qachon
 * yozilmaydi. Ular uchun jadval yaratish — faqat ko'rsatuvchi sahifa uchun —
 * migratsiya talab qilardi. Studiya yozish imkoniyatini olganda bu bazaga
 * ko'chadi; o'shanda jadval haqiqiy ehtiyojdan tug'iladi.
 *
 * Fayllar `nest-cli.json` orqali `dist/content` ga ko'chiriladi.
 */
@Injectable()
export class DafMediaOverviewService {
  private readonly log = new Logger(DafMediaOverviewService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * `dist/content` (ishlab chiqarish) va `content` (ts-node bilan mahalliy
   * ishga tushirish) — ikkalasi ham sinaladi. Bitta yo'lga tayanish
   * muhitlardan birida jimgina bo'sh sahifa berardi.
   */
  private contentDir(): string | null {
    for (const p of [
      join(__dirname, '..', '..', '..', 'content', 'daf'),
      join(process.cwd(), 'content', 'daf'),
      join(process.cwd(), 'dist', 'content', 'daf'),
    ]) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  private mediaUrl(key: string | null): string | null {
    if (!key) return null;
    const base = this.config.get<string>('R2_PUBLIC_URL');
    return base ? `${base.replace(/\/$/, '')}/${key}` : null;
  }

  private read<T>(dir: string, name: string, fallback: T): T {
    const p = join(dir, name);
    if (!existsSync(p)) return fallback;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as T;
    } catch (err) {
      this.log.error(`${name} o'qilmadi: ${String(err)}`);
      return fallback;
    }
  }

  overview(): MediaOverview {
    const dir = this.contentDir();
    if (!dir) {
      this.log.warn("content/daf topilmadi — media bo'limi bo'sh ko'rinadi");
      return {
        personas: [],
        alle: [],
        nachArt: [],
        nachBereich: [],
        summe: { anzahl: 0, bytes: 0 },
        vorhanden: false,
      };
    }

    const personas = this.read<{ personas: PersonaRow[] }>(dir, 'personas.json', {
      personas: [],
    }).personas;
    const assets = this.read<{ assets: GeneratedAsset[] }>(dir, 'generated-manifest.json', {
      assets: [],
    }).assets;

    const tally = (pick: (a: GeneratedAsset) => string) => {
      const m = new Map<string, { anzahl: number; bytes: number }>();
      for (const a of assets) {
        const cur = m.get(pick(a)) ?? { anzahl: 0, bytes: 0 };
        cur.anzahl += 1;
        cur.bytes += a.bytes;
        m.set(pick(a), cur);
      }
      return m;
    };
    const byKind = tally((a) => a.kind);
    const byBereich = tally((a) => a.bereich ?? 'sonstiges');

    return {
      personas: personas.map(({ portrait, probe, ...rest }) => ({
        ...rest,
        portraitUrl: this.mediaUrl(portrait),
        probeUrl: this.mediaUrl(probe),
      })),
      alle: assets.map(({ quelle: _q, lizenz: _l, ...rest }) => ({
        ...rest,
        bereich: rest.bereich ?? 'sonstiges',
        niveau: rest.niveau ?? null,
        einheit: rest.einheit ?? null,
        titel: rest.titel ?? rest.key.split('/').pop() ?? rest.key,
        url: this.mediaUrl(rest.key),
      })),
      nachArt: [...byKind.entries()].map(([kind, v]) => ({ kind, ...v })),
      nachBereich: [...byBereich.entries()].map(([bereich, v]) => ({ bereich, ...v })),
      summe: {
        anzahl: assets.length,
        bytes: assets.reduce((s, a) => s + a.bytes, 0),
      },
      vorhanden: true,
    };
  }
}
