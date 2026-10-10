/**
 * The I/O half of realistic dialog audio for `daf-gen-dialog-audio.ts`:
 * paid sound effects are made once and kept in R2 (`geraeusche.json`), the
 * raw Gemini recording is kept too, and the mix runs locally.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { R2Uploader } from '../../src/daf-content/media/r2-uploader';
import type { FalClient } from '../../src/daf/media/fal-client';
import { neuerAudioSchluessel } from '../../src/daf/media/audio-keys';
import { POLSTER_KENNUNG } from '../../src/daf/media/audio-polster';
import {
  geraeuschId,
  hoerspielHash,
  type HoerspielRegie,
} from '../../src/daf/media/hoerspiel';
import { mischeHoerspiel } from '../../src/daf/media/hoerspiel-mix';
import type {
  GeraeuschAuftrag,
  GeraeuschManifest,
} from '../../src/daf/media/hoerspiel-auftrag';
import type { Dialog } from '../../src/daf/inhalt/unit-inhalt.types';

export const GERAEUSCH_MANIFEST_PATH = join(
  __dirname,
  '..',
  '..',
  'content',
  'daf',
  'a1',
  'geraeusche.json',
);

export function ladeGeraeuschManifest(): GeraeuschManifest {
  return existsSync(GERAEUSCH_MANIFEST_PATH)
    ? (JSON.parse(
        readFileSync(GERAEUSCH_MANIFEST_PATH, 'utf8'),
      ) as GeraeuschManifest)
    : {};
}

export function speichereGeraeuschManifest(m: GeraeuschManifest): void {
  writeFileSync(GERAEUSCH_MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n');
}

export type R2Laden = (key: string) => Promise<Buffer>;

export function r2Laden(s3: S3Client, bucket: string): R2Laden {
  return async (key) => {
    const out = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!out.Body) throw new Error(`R2 da fayl yo'q: ${key}`);
    return Buffer.from(await out.Body.transformToByteArray());
  };
}

/**
 * Makes the missing sounds one by one; each is saved to the manifest before
 * the next is paid for, so a failure loses at most the one in flight.
 */
export async function erzeugeGeraeusche(
  auftraege: GeraeuschAuftrag[],
  deps: {
    fal: Pick<FalClient, 'geraeusch'>;
    uploader: Pick<R2Uploader, 'uploadBytes'>;
    fetchFn: typeof fetch;
    manifest: GeraeuschManifest;
    dir: string;
  },
): Promise<void> {
  for (const g of auftraege) {
    const url = await deps.fal.geraeusch(g.sfx, g.sek, g.loop);
    console.log(`    effekt «${g.sfx}» (${g.sek} s): fal.ai natijasi — ${url}`);
    const res = await deps.fetchFn(url);
    if (!res.ok) throw new Error(`effekt yuklab olinmadi — HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    await writeFile(join(deps.dir, `${g.id}.mp3`), bytes);
    const key = `daf/sfx/${randomBytes(16).toString('hex')}.mp3`;
    await deps.uploader.uploadBytes(key, bytes);
    deps.manifest[g.id] = { key, sfx: g.sfx, sek: g.sek, loop: g.loop };
    speichereGeraeuschManifest(deps.manifest);
  }
}

/** Local copies of the sounds one dialog uses (made now or earlier). */
export async function geraeuschDateien(
  h: HoerspielRegie,
  manifest: GeraeuschManifest,
  laden: R2Laden,
  dir: string,
): Promise<Map<string, string>> {
  const ids = [
    ...(h.atmo ? [geraeuschId({ ...h.atmo, loop: true })] : []),
    ...(h.geraeusche ?? []).map((g) => geraeuschId(g)),
  ];
  const out = new Map<string, string>();
  for (const id of ids) {
    const datei = join(dir, `${id}.mp3`);
    if (!existsSync(datei)) {
      const e = manifest[id];
      if (!e) throw new Error(`effekt manifestda yo'q: ${id}`);
      await writeFile(datei, await laden(e.key));
    }
    out.set(id, datei);
  }
  return out;
}

/** Mixes one dialog from its raw recording and uploads the result. */
export async function mischeUndLade(
  d: Dialog,
  roh: Buffer,
  h: HoerspielRegie,
  deps: {
    manifest: GeraeuschManifest;
    laden: R2Laden;
    uploader: Pick<R2Uploader, 'uploadBytes'>;
    dir: string;
  },
): Promise<{ key: string; hoerspiel: string; polster: string }> {
  const geraeusche = await geraeuschDateien(
    h,
    deps.manifest,
    deps.laden,
    deps.dir,
  );
  const { mp3, schnitte } = await mischeHoerspiel({
    roh,
    zeilen: d.zeilen.map((z) => z.tts ?? z.de),
    regie: h,
    geraeusche,
  });
  console.log(`    ${d.id}: kesish nuqtalari ${schnitte.join(', ')} s`);
  const key = neuerAudioSchluessel();
  await deps.uploader.uploadBytes(key, mp3);
  return { key, hoerspiel: hoerspielHash(h), polster: POLSTER_KENNUNG };
}
