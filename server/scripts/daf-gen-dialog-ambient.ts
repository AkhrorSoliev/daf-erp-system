/**
 * Tayyor dialog ustiga fon shovqini qo'yadi (oshxona, zal, kassa, park …).
 *
 * `daf-gen-dialog-audio.ts` dialogni «hayotiy» aralashma bilan yasaganda xom
 * yozuv saqlanadi va fon shovqini bepul qayta aralashadi. Aralashmasiz
 * yasalgan dialoglarda xom yozuv yo'q, shuning uchun bu skript tayyor audio
 * ustiga faqat FON qo'yadi (satrlar orasidagi effektlarsiz). Asl audio
 * `basisKey` da saqlanadi: fon balandligi yoki matni keyin o'zgarsa, qayta
 * aralashtirish pulsiz (faqat yangi fon matni pullik, sekundiga $0.002).
 *
 *   npm run daf:gen-dialog-ambient -- --dialog u06-d3 [--dry-run]
 *
 * Fon matnlari `content/daf/a1/dialog-ambient.json` da:
 *   { "u06-d3": { "sfx": "sports hall …", "sek": 10, "lautstaerke": 0.1 } }
 */
import 'dotenv/config';
import { execFile } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { S3Client } from '@aws-sdk/client-s3';
import { FalClient } from '../src/daf/media/fal-client';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import { neuerAudioSchluessel } from '../src/daf/media/audio-keys';
import {
  ATMO_LAUTSTAERKE,
  geraeuschId,
  mischFfmpegArgs,
  type MischPlan,
} from '../src/daf/media/hoerspiel';
import {
  GERAEUSCH_PREIS_SEK,
  benoetigteGeraeusche,
} from '../src/daf/media/hoerspiel-auftrag';
import { dauerSek } from '../src/daf/media/hoerspiel-mix';
import type { DialogAudioManifest } from '../src/daf/inhalt/dialog-audio';
import type { DialogeFile } from '../src/daf/inhalt/unit-inhalt.types';
import {
  erzeugeGeraeusche,
  geraeuschDateien,
  ladeGeraeuschManifest,
  r2Laden,
} from './lib/hoerspiel-lauf';

const execFileAsync = promisify(execFile);
const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const MANIFEST_PATH = join(A1, 'dialog-audio.json');
const AMBIENT_PATH = join(A1, 'dialog-ambient.json');

export interface AmbientRegie {
  sfx: string;
  sek: number;
  lautstaerke?: number;
}

/** Nimaga qarab «bu fon allaqachon qo'yilgan» deb hisoblanadi. */
export function ambientHash(a: AmbientRegie): string {
  return (
    geraeuschId({ sfx: a.sfx, sek: a.sek, loop: true }) +
    `@${a.lautstaerke ?? ATMO_LAUTSTAERKE}`
  );
}

/** Butun dialog bitta bo'lak, ustida fon: boshi/oxiriga qo'shimcha jimlik yo'q. */
export function ambientMischPlan(dauer: number, a: AmbientRegie): MischPlan {
  return {
    clips: [
      { quelle: 'roh', von: 0, bis: dauer, at: 0, fern: false, lautstaerke: 1 },
    ],
    gesamt: dauer,
    atmo: {
      id: geraeuschId({ sfx: a.sfx, sek: a.sek, loop: true }),
      lautstaerke: a.lautstaerke ?? ATMO_LAUTSTAERKE,
    },
  };
}

function ids(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === flag && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return [...new Set(out)];
}

async function main(): Promise<void> {
  const gewaehlt = ids('--dialog');
  if (gewaehlt.length === 0) throw new Error('Kerak: --dialog <kod>');
  const ambient = JSON.parse(readFileSync(AMBIENT_PATH, 'utf8')) as Record<
    string,
    AmbientRegie
  >;
  const manifest = JSON.parse(
    readFileSync(MANIFEST_PATH, 'utf8'),
  ) as DialogAudioManifest;
  const dialoge = gewaehlt.map((id) => {
    const unit = id.slice(0, 3);
    const d = (
      JSON.parse(
        readFileSync(join(A1, unit, 'dialoge.json'), 'utf8'),
      ) as DialogeFile
    ).dialoge.find((x) => x.id === id);
    if (!d) throw new Error(`${id}: dialog topilmadi`);
    if (!ambient[id]) throw new Error(`${id}: dialog-ambient.json da yo'q`);
    if (!manifest[id]) throw new Error(`${id}: hali ovozi yo'q`);
    return d;
  });
  const geraeuschManifest = ladeGeraeuschManifest();
  const regie = Object.fromEntries(
    dialoge.map((d) => [d.id, { hoerspiel: { atmo: ambient[d.id] } }]),
  );
  const neu = benoetigteGeraeusche(dialoge, regie, geraeuschManifest);
  const sek = neu.reduce((n, g) => n + g.sek, 0);
  console.log(
    `Yangi fon: ${neu.length} ta, ${sek} s (≈ $${(sek * GERAEUSCH_PREIS_SEK).toFixed(3)}).`,
  );
  if (process.argv.includes('--dry-run')) {
    for (const g of neu) console.log(`  fon: «${g.sfx}» ${g.sek} s`);
    console.log('--dry-run: hech narsa yuborilmadi.');
    return;
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const uploader = new R2Uploader(s3, process.env.R2_BUCKET_NAME!);
  const laden = r2Laden(s3, process.env.R2_BUCKET_NAME!);
  const dir = await mkdtemp(join(tmpdir(), 'daf-ambient-'));
  try {
    if (neu.length > 0) {
      if (!process.env.FAL_KEY) throw new Error('FAL_KEY sozlanmagan');
      await erzeugeGeraeusche(neu, {
        fal: new FalClient(process.env.FAL_KEY),
        uploader,
        fetchFn: fetch,
        manifest: geraeuschManifest,
        dir,
      });
    }
    for (const d of dialoge) {
      const a = ambient[d.id];
      const eintrag = manifest[d.id];
      if (eintrag.ambient === ambientHash(a)) {
        console.log(`  ${d.id}: fon allaqachon shu, o'tkazildi`);
        continue;
      }
      const basisKey = eintrag.basisKey ?? eintrag.key;
      const roh = join(dir, `${d.id}.mp3`);
      await writeFile(roh, await laden(basisKey));
      const geraeusche = await geraeuschDateien(
        { atmo: a },
        geraeuschManifest,
        laden,
        dir,
      );
      const ausgabe = join(dir, `${d.id}-fon.mp3`);
      await execFileAsync(
        'ffmpeg',
        mischFfmpegArgs(ambientMischPlan(await dauerSek(roh), a), {
          roh,
          geraeusche,
          ausgabe,
        }),
      );
      const key = neuerAudioSchluessel();
      await uploader.uploadBytes(key, await readFile(ausgabe));
      manifest[d.id] = { ...eintrag, key, basisKey, ambient: ambientHash(a) };
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
      console.log(`  ${d.id}: ${d.titelDe} → fon qo'yildi, yuklandi`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(`Manifest yangilandi: ${MANIFEST_PATH}.`);
}

if (require.main === module) {
  void main().catch((e: unknown) => {
    console.error(`Xato: ${(e as Error).message}`);
    process.exit(1);
  });
}
