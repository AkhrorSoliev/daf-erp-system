/**
 * Har bir joyni topadi — kod qayerda «bu o'quvchi faol» deb o'zicha hukm
 * chiqarayotganini manbaning o'zidan sanaydi.
 *
 * NEGA KERAK: «faol o'quvchi» ta'rifi `students/shared/active-student-where.ts`
 * ga yig'ilgan, lekin funksiyani ishlatishga hech narsa majburlamaydi. U oddiy
 * eksport — undan foydalanmagan kod ham muvaffaqiyatli kompilyatsiya bo'ladi,
 * testlar ham o'tadi, sahifa ham ochiladi. Faqat son boshqacha chiqadi.
 *
 * Aynan shu bo'ldi ham: ta'rif 2026-09-02 da bitta joyga yig'ilganda uchta
 * chaqiruv ko'chirildi, qolganlari eski shartini yozib qolaverdi. 2026-09-10
 * dagi prod o'lchovi (Farg'ona filiali): bosh sahifa 331 derdi, o'sha
 * o'quvchilar ro'yxati turgan /students sahifasining kartochkasi 486, kunlik
 * Telegram hisoboti esa 490. Uchalasi ham «Faol o'quvchilar» deb nomlanardi.
 *
 * NEGA AST, REGEX EMAS: bu tekshiruv uchun eng yomon nosozlik — shartni
 * SEZMAY qolish. Unda ro'yxat bo'sh chiqadi, test yashil bo'ladi va yangi
 * qo'shilgan noto'g'ri sanoq qoplangan hisoblanadi. Regex ko'p qatorli
 * `where`, izoh ichidagi kod, boshqacha bo'shliq — hammasida sinadi.
 * Kompilyatorning o'z parseri sinmaydi.
 *
 * NEGA `scripts/` DA: `typescript` — devDependency, va `tsconfig.build.json`
 * bu katalogni chiqarib tashlaydi. Shunday qilib kompilyator hech qachon
 * `dist/` ga tushmaydi va ilova kodi undan bexosdan bog'liq bo'lib qololmaydi.
 * Bu `route-inventory.ts` bilan bir xil sabab.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

/**
 * Faqat AHOLINI sanaydigan amallar. `findFirst` / `findUnique` — bitta
 * o'quvchini ochish, u yerdagi `status: 'ACTIVE'` «shu odam faolmi» degan
 * savol, «nechta faol bor» degani emas. Ularni qo'shish ro'yxatni o'nlab
 * aloqasiz joy bilan to'ldirib, tekshiruvni o'qib bo'lmas holga keltiradi.
 */
const POPULATION_OPS = new Set(['count', 'aggregate', 'groupBy', 'findMany']);

/** Ta'rifni olib keladigan yagona to'g'ri yo'l. */
const CANONICAL_HELPERS = new Set([
  'activeStudentWhere',
  'ungroupedStudentWhere',
]);

export interface StudentPopulationSite {
  /** Manifest kaliti: `fayl::funksiya` (bir funksiyada bir nechta bo'lsa `#2`). */
  key: string;
  file: string;
  /** Chaqiruv turgan metod/funksiya nomi. */
  fn: string;
  op: string;
  /** Diagnostika uchun — kalitga KIRMAYDI, chunki har tahrirda suriladi. */
  line: number;
  /** `where` ning yuqori qavatida FAOLLIK da'vo qilgan ustunlar. */
  statusKeys: string[];
  /** `...activeStudentWhere()` yoki `...ungroupedStudentWhere()` yoyilganmi. */
  usesCanonical: boolean;
  /**
   * `where` obyekt literali sifatida yozilmagan (o'zgaruvchida qurilgan), shu
   * sababli mazmuni o'qilmadi. Bunday joy avtomatik oqlanmaydi — manifestda
   * odam tomonidan tasdiqlanishi kerak.
   */
  unresolved: boolean;
}

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listFiles(full, out);
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

/** `prisma.student.count` kabi zanjirdan amal nomini ajratadi. */
function studentOp(node: ts.CallExpression): string | null {
  const target = node.expression;
  if (!ts.isPropertyAccessExpression(target)) return null;

  const op = target.name.text;
  if (!POPULATION_OPS.has(op)) return null;

  const model = target.expression;
  if (!ts.isPropertyAccessExpression(model)) return null;
  if (model.name.text !== 'student') return null;

  return op;
}

/** Chaqiruv turgan eng yaqin nomlangan metod/funksiya. */
function enclosingFn(node: ts.Node): string {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n)) {
      if (n.name && ts.isIdentifier(n.name)) return n.name.text;
    }
    if (ts.isPropertyDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
    ) {
      return n.name.text;
    }
  }
  return '(top-level)';
}

/** `'ACTIVE'` yoki `StudentStatus.ACTIVE` — ikkala yozilishi ham. */
function isActiveStatusValue(expr: ts.Expression): boolean {
  if (ts.isStringLiteral(expr)) return expr.text === 'ACTIVE';
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === 'ACTIVE';
  return false;
}

/**
 * `where` obyektining YUQORI qavatida faollik da'vo qilinganmi.
 *
 * Faqat yuqori qavat — `enrollments: { some: { status: 'ACTIVE' } }` ichidagi
 * `status` yozuvning holati, o'quvchining emas. Uni ham hisoblash to'g'ri
 * yozilgan har bir shartni ham buzuq deb belgilagan bo'lardi.
 *
 * Faqat FAOL qiymat — `status: 'EXPELLED'` yoki `status: 'FROZEN'` faollik
 * haqida hech nima da'vo qilmayapti, shuning uchun ta'rifdan chetga chiqishi
 * ham mumkin emas. Ularni qo'shish manifestni aloqasiz qator bilan to'ldirib,
 * haqiqiy topilmalarni ko'rinmas qilardi.
 */
function inspectWhere(where: ts.ObjectLiteralExpression): {
  statusKeys: string[];
  usesCanonical: boolean;
} {
  const statusKeys: string[] = [];
  let usesCanonical = false;

  for (const prop of where.properties) {
    if (ts.isSpreadAssignment(prop)) {
      const expr = prop.expression;
      const callee = ts.isCallExpression(expr) ? expr.expression : expr;
      if (ts.isIdentifier(callee) && CANONICAL_HELPERS.has(callee.text)) {
        usesCanonical = true;
      }
      continue;
    }

    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name;
    const key = ts.isIdentifier(name)
      ? name.text
      : ts.isStringLiteral(name)
        ? name.text
        : null;

    if (key === 'status' && isActiveStatusValue(prop.initializer)) {
      statusKeys.push(key);
    }
    if (key === 'isActive' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      statusKeys.push(key);
    }
  }

  return { statusKeys, usesCanonical };
}

/** `where:` xossasiga berilgan ifoda, bo'lmasa `null`. */
function whereExpression(call: ts.CallExpression): ts.Expression | null {
  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return null;

  for (const prop of arg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'where'
    ) {
      return prop.initializer;
    }
  }
  return null;
}

/**
 * Fayldagi `const x = { ... }` e'lonlari — `where: someWhere` ni ochish uchun.
 *
 * Bir nom ikki marta e'lon qilingan bo'lsa (turli qamrovlarda) qaysi biri
 * nazarda tutilganini bilib bo'lmaydi, shuning uchun umuman qaytarilmaydi:
 * u holda joy «o'qilmadi» deb belgilanadi va manifestga tushadi. Noto'g'ri
 * e'lonni o'qib «hammasi joyida» deyishdan ko'ra shu yaxshi.
 */
function collectObjectConsts(
  source: ts.SourceFile,
): Map<string, ts.ObjectLiteralExpression | null> {
  const byName = new Map<string, ts.ObjectLiteralExpression | null>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const name = node.name.text;
      byName.set(name, byName.has(name) ? null : node.initializer);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return byName;
}

/**
 * `srcDir` ostidagi har bir «nechta o'quvchi» so'rovi.
 *
 * Holat ustuniga UMUMAN tegmaydigan so'rov (masalan «bazadagi jami o'quvchi»)
 * qaytarilmaydi: u faollik haqida hech nima da'vo qilmayapti, shuning uchun
 * ta'rifdan chetga chiqishi ham mumkin emas.
 */
export function discoverStudentPopulationSites(
  srcDir: string,
  repoRoot: string,
): StudentPopulationSite[] {
  const sites: StudentPopulationSite[] = [];

  for (const file of listFiles(srcDir)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const rel = file.startsWith(repoRoot) ? file.slice(repoRoot.length + 1) : file;
    const objectConsts = collectObjectConsts(source);
    const perFn = new Map<string, number>();

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const op = studentOp(node);
        const expr = op ? whereExpression(node) : null;
        if (op && expr) {
          let literal: ts.ObjectLiteralExpression | null = null;
          let unresolved = false;

          if (ts.isObjectLiteralExpression(expr)) {
            literal = expr;
          } else if (ts.isIdentifier(expr)) {
            // `where: someWhere` — fayl ichidagi e'londan ochiladi. Ochilmasa
            // joy o'qilmagan deb belgilanadi, jimgina o'tkazib yuborilmaydi.
            literal = objectConsts.get(expr.text) ?? null;
            unresolved = literal === null;
          } else {
            unresolved = true;
          }

          const { statusKeys, usesCanonical } = literal
            ? inspectWhere(literal)
            : { statusKeys: [], usesCanonical: false };

          // Tartib raqami funksiyadagi HAMMA o'quvchi so'rovi bo'yicha
          // sanaladi, faqat belgilanganlari bo'yicha emas. Aks holda bitta
          // so'rovni tuzatish qolganlarining kalitini surib yuborardi va
          // manifest o'zi tegilmagan qatorlar bilan yiqilardi.
          const fn = enclosingFn(node);
          const seen = (perFn.get(fn) ?? 0) + 1;
          perFn.set(fn, seen);

          if (statusKeys.length > 0 || usesCanonical || unresolved) {
            sites.push({
              key: seen === 1 ? `${rel}::${fn}` : `${rel}::${fn}#${seen}`,
              file: rel,
              fn,
              op,
              line:
                source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
              statusKeys,
              usesCanonical,
              unresolved,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return sites.sort((a, b) => a.key.localeCompare(b.key));
}
