/**
 * `content/daf/jang/*.json` → `DafBattleQuestion` (spec §4).
 *
 * Holat fayldan: `tasdiqlangan: true` → APPROVED, aks holda DRAFT. Fayldan
 * olib tashlangan savol o'chirilmaydi (eski jang javoblari unga bog'liq),
 * DRAFT qilinadi — jangga boshqa tushmaydi.
 *
 * `npm run daf:jang-seed` (dev) yoki `railway run npx ts-node --transpile-only scripts/daf-jang-seed.ts` (prod).
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { run } from './lib/check-cli';
import {
  jangFayliXatolari,
  type JangSavolFayli,
} from '../src/daf/jang/jang-savollari.validate';

const DIR = join(__dirname, '..', 'content', 'daf', 'jang');

void run(async (prisma) => {
  const eshitish = JSON.parse(
    readFileSync(join(DIR, 'eshitish-uzunligi.json'), 'utf8'),
  ) as Record<string, number>;
  const fayllar = readdirSync(DIR)
    .filter((f) => /^a1-u\d{2}\.json$/.test(f))
    .sort();
  for (const nom of fayllar) {
    const f = JSON.parse(
      readFileSync(join(DIR, nom), 'utf8'),
    ) as JangSavolFayli;
    const xatolar = jangFayliXatolari(f, eshitish);
    if (xatolar.length) throw new Error(`${nom}:\n${xatolar.join('\n')}`);
    const unit = await prisma.dafUnit.findUniqueOrThrow({
      where: { level_order: { level: f.level, order: f.order } },
      select: { id: true },
    });
    const lexemeIds = f.savollar.flatMap((s) => (s.lexeme ? [s.lexeme] : []));
    const lexemes = new Map(
      (
        await prisma.dafLexeme.findMany({
          where: { sourceId: { in: lexemeIds } },
          select: {
            sourceId: true,
            audioKey: true,
            audioStartMs: true,
            audioEndMs: true,
          },
        })
      ).map((l) => [l.sourceId, l]),
    );
    const status = f.tasdiqlangan ? 'APPROVED' : 'DRAFT';
    await prisma.$transaction(
      async (tx) => {
        for (const s of f.savollar) {
          const l = s.lexeme ? lexemes.get(s.lexeme) : undefined;
          if (s.kind === 'LISTEN' && !l?.audioKey)
            throw new Error(`${s.id}: ${s.lexeme} ovozi bazada yo'q`);
          const data = {
            unitId: unit.id,
            kind: s.kind,
            prompt: s.prompt,
            options: s.options ?? [],
            answer: s.answer,
            akzeptiert: s.akzeptiert ?? [],
            audioKey: l?.audioKey ?? null,
            audioStartMs: l?.audioStartMs ?? null,
            audioEndMs: l?.audioEndMs ?? null,
            status,
          } as const;
          await tx.dafBattleQuestion.upsert({
            where: { sourceId: s.id },
            create: { sourceId: s.id, ...data },
            update: data,
          });
        }
        await tx.dafBattleQuestion.updateMany({
          where: {
            unitId: unit.id,
            sourceId: { notIn: f.savollar.map((s) => s.id) },
          },
          data: { status: 'DRAFT' },
        });
        // 35+ ketma-ket upsert uzoq bazada standart 5 s dan oshadi.
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
    console.log(`${nom}: ${f.savollar.length} savol, ${status}`);
  }
});
