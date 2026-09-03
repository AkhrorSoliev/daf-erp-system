/**
 * Yasalgan media papkasini skanerlab `generated-manifest.json` ni QAYTA yozadi.
 *
 *   npm run daf:media-manifest -- --from ~/Desktop/daf-kontent/r2
 *
 * Manifest QO'LDA tahrirlanmaydi. Sabab o'lchangan: obrazlar qo'lda yozilgan
 * edi va A1 audiosi bilan B1 epizodi manifestga tushmay qoldi — media bo'limi
 * yasalgan kontentning uchdan bir qismini ko'rsatmadi. Skript esa papkada
 * nima bo'lsa shuni yozadi, ya'ni yangi fayl o'z-o'zidan ko'rinadi.
 *
 * Guruhlash kalit YO'LIDAN olinadi — alohida ro'yxat yuritilmaydi:
 *   daf/persona/portrait/<id>.jpg      → obrazlar
 *   daf/persona/voice/<id>.mp3         → obrazlar
 *   daf/<niveau>/k<NN>/audio/<id>.mp3  → bo'lim audiosi
 *   daf/<niveau>/k<NN>/bild/<id>.jpg   → bo'lim rasmi
 *   daf/<niveau>/sendung/<id>/...      → ko'rsatuv
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, resolve, extname } from 'path';

const OUT = join(__dirname, '..', 'content', 'daf', 'generated-manifest.json');

type Kind = 'AUDIO' | 'VIDEO' | 'IMAGE' | 'PDF';
const KIND_BY_EXT: Record<string, Kind> = {
  '.mp3': 'AUDIO', '.m4a': 'AUDIO', '.wav': 'AUDIO',
  '.mp4': 'VIDEO', '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.png': 'IMAGE',
  '.pdf': 'PDF',
};

export interface ManifestAsset {
  key: string;
  kind: Kind;
  bytes: number;
  sha256: string;
  /** Sahifadagi bo'lim: `persona` | `einheit` | `sendung` | `sonstiges`. */
  bereich: string;
  /** `A1` | `A2` | `B1` — obrazlarda yo'q. */
  niveau: string | null;
  /** Bo'lim raqami yoki ko'rsatuv nomi. */
  einheit: string | null;
  titel: string;
  quelle: string;
  lizenz: string;
}

/**
 * Sarlavha kontent JSON'laridan olinadi: fayl nomi o'zi ma'no bermaydi
 * (`1-05.mp3` nima ekanini aytmaydi). Topilmasa fayl nomiga qaytadi —
 * bo'sh sarlavha ro'yxatni o'qib bo'lmaydigan qiladi.
 */
function titelLookup(): Map<string, string> {
  const m = new Map<string, string>();
  const dir = join(__dirname, '..', 'content', 'daf');
  const personas = join(dir, 'personas.json');
  if (existsSync(personas)) {
    const d = JSON.parse(readFileSync(personas, 'utf8')) as {
      personas: { id: string; vorname: string; nachname: string }[];
    };
    for (const p of d.personas) m.set(p.id, `${p.vorname} ${p.nachname}`);
  }
  return m;
}

function classify(key: string, titel: Map<string, string>) {
  const parts = key.split('/');
  const stem = parts[parts.length - 1].replace(extname(key), '');
  if (parts[1] === 'persona') {
    const rolle = parts[2] === 'portrait' ? 'portret' : 'ovoz';
    return {
      bereich: 'persona',
      niveau: null,
      einheit: null,
      titel: `${titel.get(stem) ?? stem} — ${rolle}`,
    };
  }
  if (parts[2] === 'sendung') {
    return {
      bereich: 'sendung',
      niveau: parts[1].toUpperCase(),
      einheit: parts[3] ?? null,
      titel: `${parts[3] ?? 'ko‘rsatuv'} — ${stem}`,
    };
  }
  if (/^k\d+$/.test(parts[2] ?? '')) {
    const nr = String(Number(parts[2].slice(1)));
    const art = parts[3] === 'bild' ? 'rasm' : 'audio';
    return {
      bereich: 'einheit',
      niveau: parts[1].toUpperCase(),
      einheit: nr,
      titel: `${nr}-bo‘lim ${art} — ${stem}`,
    };
  }
  return { bereich: 'sonstiges', niveau: null, einheit: null, titel: stem };
}

function walk(root: string, rel = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, rel))) {
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(join(root, r)).isDirectory()) out.push(...walk(root, r));
    else out.push(r);
  }
  return out;
}

function main() {
  const i = process.argv.indexOf('--from');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Kerak: --from <media papkasi>');
    process.exit(1);
  }
  const dir = resolve(process.argv[i + 1].replace(/^~/, process.env.HOME ?? '~'));
  const titel = titelLookup();

  const assets: ManifestAsset[] = [];
  const skipped: string[] = [];
  for (const key of walk(dir).sort()) {
    const ext = extname(key).toLowerCase();
    const kind = KIND_BY_EXT[ext];
    if (!kind) {
      skipped.push(key);
      continue;
    }
    const buf = readFileSync(join(dir, key));
    assets.push({
      key,
      kind,
      bytes: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex').slice(0, 16),
      ...classify(key, titel),
      quelle: 'DaF Fergana — AI bilan yaratilgan',
      lizenz: '© DaF Fergana',
    });
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        version: 2,
        hinweis:
          "O'zimiz yaratgan media. Bu fayl QO'LDA tahrirlanmaydi — "
          + 'npm run daf:media-manifest bilan qayta yasaladi.',
        assets,
      },
      null,
      1,
    ) + '\n',
    'utf8',
  );

  const byBereich = new Map<string, number>();
  for (const a of assets) byBereich.set(a.bereich, (byBereich.get(a.bereich) ?? 0) + 1);
  console.log(`${assets.length} ta aktiv yozildi:`);
  for (const [b, n] of byBereich) console.log(`  ${b.padEnd(12)} ${n}`);
  if (skipped.length > 0) {
    console.log(`\nTanilmagan kengaytma, o'tkazib yuborildi: ${skipped.length}`);
    for (const s of skipped.slice(0, 5)) console.log(`  - ${s}`);
  }
}

main();
