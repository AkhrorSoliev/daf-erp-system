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
import {
  FalAblehnungError,
  type FalClient,
  type GeminiDialog,
} from '../../src/daf/media/fal-client';
import { teileMehrstimmig } from '../../src/daf/media/mehrstimmig';
import { polstereMp3 } from '../../src/daf/media/audio-polster';
import { neuerAudioSchluessel } from '../../src/daf/media/audio-keys';
import { POLSTER_KENNUNG } from '../../src/daf/media/audio-polster';
import { zuMp3 } from '../../src/daf/media/audio-format';
import {
  geraeuschId,
  hoerspielHash,
  type HoerspielRegie,
} from '../../src/daf/media/hoerspiel';
import {
  mischeHoerspiel,
  setzeZusammen,
} from '../../src/daf/media/hoerspiel-mix';
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

/**
 * The mix step of a new recording: the raw recording is kept first (a later
 * change of the mix is then free), then mixed. A failed mix never loses the
 * paid recording: it goes in padded, without the mix (no `hoerspiel` hash),
 * and the next run remixes it for free.
 */
export function erstelleMische(
  regie: Record<string, { hoerspiel?: HoerspielRegie }>,
  uploader: Pick<R2Uploader, 'uploadBytes'>,
  mischDeps: Parameters<typeof mischeUndLade>[3],
) {
  return async (d: Dialog, roh: Buffer) => {
    const h = regie[d.id]?.hoerspiel;
    if (!h) return null;
    const rohKey = neuerAudioSchluessel();
    await uploader.uploadBytes(rohKey, roh);
    try {
      return { ...(await mischeUndLade(d, roh, h, mischDeps)), rohKey };
    } catch (err) {
      console.error(
        `    ${d.id}: aralashtirilmadi (${(err as Error).message}) — oddiy ovoz saqlandi, keyingi yurishda bepul qayta aralashtiriladi`,
      );
      const key = neuerAudioSchluessel();
      await uploader.uploadBytes(key, await polstereMp3(roh));
      return { key, polster: POLSTER_KENNUNG, rohKey };
    }
  };
}

async function mitAblehnung<T>(
  f: () => Promise<T>,
  id: string,
  versuche: number,
): Promise<T> {
  for (let versuch = 1; ; versuch++) {
    try {
      return await f();
    } catch (err) {
      if (!(err instanceof FalAblehnungError) || versuch >= versuche) throw err;
      console.log(
        `    ${id}: fal.ai rad etdi (${versuch}-marta), yana so'rayapman`,
      );
    }
  }
}

/**
 * A dialog of more than two speakers (`mehrstimmig.ts`): the two busiest
 * speakers in one Gemini request, every other line alone, rebuilt in order.
 * fal.ai's temporary URLs are printed so a paid piece can be recovered.
 */
export function erstelleMehrstimmig(
  fal: Pick<FalClient, 'dialogGemini' | 'sprecheGemini'>,
  fetchFn: typeof fetch,
  versuche: number,
) {
  return async (d: Dialog, anfrage: GeminiDialog): Promise<Buffer> => {
    const t = teileMehrstimmig(anfrage);
    const holen = async (url: string, wofuer: string) => {
      console.log(`    ${d.id}: ${wofuer} — ${url}`);
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`yuklab olinmadi — HTTP ${res.status}`);
      return zuMp3(Buffer.from(await res.arrayBuffer()));
    };
    const haupt = await holen(
      await mitAblehnung(() => fal.dialogGemini(t.haupt), d.id, versuche),
      'asosiy suhbat',
    );
    const einzeln = new Map<number, Buffer>();
    for (const e of t.einzeln) {
      const url = await mitAblehnung(
        () => fal.sprecheGemini(e.prompt, e.voice, e.styleInstructions),
        d.id,
        versuche,
      );
      einzeln.set(e.index, await holen(url, `${e.index + 1}-satr alohida`));
    }
    return setzeZusammen({
      haupt,
      hauptZeilen: t.reihenfolge.flatMap((p, i) =>
        'haupt' in p ? [d.zeilen[i].tts ?? d.zeilen[i].de] : [],
      ),
      einzeln,
      reihenfolge: t.reihenfolge,
    });
  };
}
