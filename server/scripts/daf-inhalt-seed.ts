/**
 * Bitta unitning matnini (so'z, gap, dialog, grammatika, redemittel)
 * bazaga tushiradi.
 *
 *   npm run daf:inhalt-seed -- --unit 1
 *
 * Idempotent — barqaror kalitlar bo'yicha yangilaydi, takrorlamaydi.
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { InhaltSeedService } from '../src/daf/inhalt/inhalt-seed.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { AudioManifest } from '../src/daf/media/audio-keys';
import type {
  DialogeFile,
  GrammatikFile,
  RedemittelFile,
  SaetzeFile,
  WoerterFile,
} from '../src/daf/inhalt/unit-inhalt.types';

function readUnitCode(): string {
  const i = process.argv.indexOf('--unit');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Kerak: --unit <raqam>');
    process.exit(1);
  }
  return `u${String(Number(process.argv[i + 1])).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const unitCode = readUnitCode();
  const dir = join(__dirname, '..', 'content', 'daf', 'a1', unitCode);
  const read = <T>(name: string): T =>
    JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;

  // Audio hali barcha unitlarga yasalmagan (bosqichma-bosqich yasaladi),
  // shuning uchun fayl yo'qligi xato EMAS — bo'sh manifest sifatida
  // o'qiladi va `audioSchluesselFuer` shu so'zlarga `null` qaytaradi.
  const audioPath = join(__dirname, '..', 'content', 'daf', 'a1', 'audio.json');
  const audio: AudioManifest = existsSync(audioPath)
    ? (JSON.parse(readFileSync(audioPath, 'utf8')) as AudioManifest)
    : {};

  const files = {
    woerter: read<WoerterFile>('woerter.json'),
    saetze: read<SaetzeFile>('saetze.json'),
    dialoge: read<DialogeFile>('dialoge.json'),
    grammatik: read<GrammatikFile>('grammatik.json'),
    redemittel: read<RedemittelFile>('redemittel.json'),
    audio,
  };

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const service = new InhaltSeedService(prisma as unknown as PrismaService);
    const report = await service.seed(unitCode, files);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
