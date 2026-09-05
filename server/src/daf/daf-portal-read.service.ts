import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DafLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Yo'lning tartibi. Daraja o'sish tartibida yuriladi.
 *
 * Uchta daraja, beshta emas: `A1.1`/`A1.2` bo'linishi manbaning yorlig'i
 * edi, o'quvchi va Goethe imtihoni uchun esa daraja bitta — A1.
 */
export const LEVEL_ORDER: DafLevel[] = [DafLevel.A1, DafLevel.A2, DafLevel.B1];

/** Ekranda ko'rinadigan daraja nomi. */
export const LEVEL_LABEL: Record<DafLevel, string> = {
  [DafLevel.A1]: 'A1',
  [DafLevel.A2]: 'A2',
  [DafLevel.B1]: 'B1',
};

export interface LevelPathItem {
  level: DafLevel;
  label: string;
  units: {
    id: number;
    order: number;
    titleUz: string;
    titleDe: string;
    lessonCount: number;
    doneCount: number;
  }[];
}

@Injectable()
export class DafPortalReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** R2 kalitini ommaviy manzilga aylantiradi. */
  private mediaUrl(key: string | null): string | null {
    if (!key) return null;
    const base = this.config.get<string>('R2_PUBLIC_URL');
    return base ? `${base.replace(/\/$/, '')}/${key}` : null;
  }

  /**
   * Daraja yo'li: A1 dan B1 gacha, har darajada bo'limlar.
   *
   * Bo'limi yo'q daraja ham qaytariladi — o'quvchi butun yo'lni ko'rishi
   * kerak, shu jumladan hali kontenti yo'q bosqichlarni ham. Ularni
   * yashirish «B1 umuman yo'q» degan taassurot qoldirardi.
   */
  async getLevels(studentId: number): Promise<LevelPathItem[]> {
    const units = await this.prisma.dafUnit.findMany({
      // Nafaqaga chiqarilgan unit yo'lga chiqmaydi. A1 migratsiyasi eski
      // 20 ta DiB unitini `retiredAt` bilan belgilab, `order`ini
      // manfiyga o'tkazdi (yangi 12 unit 1..12ni egallashi uchun) — shu
      // filtrsiz ular ham qaytardi, VA manfiy `order` ustuvorligida
      // (o'sish tartibida saralanganda eng manfiysi birinchi) o'quvchining
      // yo'li teskari aylanardi.
      where: { retiredAt: null },
      orderBy: [{ level: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        level: true,
        order: true,
        titleUz: true,
        titleDe: true,
        _count: { select: { lessons: true } },
      },
    });

    // Tugallangan seanslar SANALADI, ro'yxati kerak emas: yo'l kartasida
    // faqat `4/18` ko'rinadi. `completedAt: { not: null }` shart —
    // qator seans boshlanganda emas, TUGAGANDA yoziladi, lekin
    // kelajakda boshqa yozuvchi paydo bo'lsa yarim qator sanalmasin.
    const bajarilgan = await this.prisma.dafLessonProgress.findMany({
      where: { studentId, completedAt: { not: null } },
      select: { lesson: { select: { unitId: true } } },
    });
    const bajarilganSoni = new Map<number, number>();
    for (const p of bajarilgan) {
      const u = p.lesson.unitId;
      bajarilganSoni.set(u, (bajarilganSoni.get(u) ?? 0) + 1);
    }

    return LEVEL_ORDER.map((level) => ({
      level,
      label: LEVEL_LABEL[level],
      units: units
        .filter((u) => u.level === level)
        .map((u) => ({
          id: u.id,
          order: u.order,
          titleUz: u.titleUz,
          titleDe: u.titleDe,
          lessonCount: u._count.lessons,
          doneCount: bajarilganSoni.get(u.id) ?? 0,
        })),
    }));
  }

  /**
   * Bitta bo'lim — BOSQICHLAR ro'yxati (har bo'limda aynan beshta).
   *
   * Bo'limning o'zi lug'at yoki mashq qaytarmaydi: bo'limda 30–50 so'z va
   * o'nlab mashq bor, ya'ni bitta ekranga sig'maydi va o'quvchi qayerdan
   * boshlashini bilmaydi. Kontent bosqichning ichida.
   */
  async getUnit(unitId: number, studentId: number) {
    const unit = await this.prisma.dafUnit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        level: true,
        order: true,
        titleUz: true,
        titleDe: true,
        retiredAt: true,
      },
    });
    // Nafaqaga chiqarilgan unit ham "topilmadi" — `getLevels` uni
    // ko'rsatmaydi, shuning uchun uning ID'siga to'g'ridan-to'g'ri
    // kirish ham xuddi shu 404 yo'lidan o'tishi kerak.
    if (!unit || unit.retiredAt)
      throw new NotFoundException("Bo'lim topilmadi");

    // Seans tartibi — `order` ning o'zi (`tier` emas): yangi A1 xaritasi
    // darslarini `tier`siz yozadi (u endi null), `order` esa har ikkala
    // avlodda ham to'ldirilgan — eski seed uni `tier`dan hosil qilgan.
    const lessons = await this.prisma.dafLesson.findMany({
      where: { unitId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        order: true,
        tier: true,
        kind: true,
        sectionId: true,
        titleDe: true,
        titleUz: true,
        _count: { select: { lexemes: true, exercises: true } },
      },
    });

    // Bo'lim guruhlari faqat sarlavha uchun — dizaynda bo'limning o'z
    // sahifasi yo'q, u shunchaki unit ichidagi darslarni to'playdigan
    // ko'rinish qatlami.
    const sections = await this.prisma.dafSection.findMany({
      where: { unitId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        order: true,
        code: true,
        titleUz: true,
        titleDe: true,
      },
    });

    const fortschritt = await this.prisma.dafLessonProgress.findMany({
      where: { studentId, lesson: { unitId } },
      select: {
        lessonId: true,
        completedAt: true,
        bestScore: true,
        runs: true,
      },
    });
    const byLesson = new Map(fortschritt.map((f) => [f.lessonId, f]));

    const toItem = (l: (typeof lessons)[number]) => {
      const f = byLesson.get(l.id);
      return {
        id: l.id,
        order: l.order,
        tier: l.tier,
        kind: l.kind,
        titleDe: l.titleDe,
        titleUz: l.titleUz,
        wordCount: l._count.lexemes,
        exerciseCount: l._count.exercises,
        // `Date` obyekti JSON'da ISO satrga aylanadi — mijoz tipi
        // (`LernenSeans.completedAt: string | null`) shuni kutadi.
        completedAt: f?.completedAt ?? null,
        bestScore: f?.bestScore ?? 0,
        runs: f?.runs ?? 0,
      };
    };

    const alle = lessons.map(toItem);

    // Yakuniy sinov bo'lim ichida emas — u butun unitni sinaydi va
    // dizaynda oxirida alohida turadi.
    const finalTest = alle.find((l) => l.kind === 'UNIT_TEST') ?? null;

    const bySection = new Map<number, typeof alle>();
    for (const item of alle) {
      const raw = lessons.find((l) => l.id === item.id)!;
      if (raw.sectionId == null || item.kind === 'UNIT_TEST') continue;
      const list = bySection.get(raw.sectionId) ?? [];
      list.push(item);
      bySection.set(raw.sectionId, list);
    }

    // `orderBy` yuqorida DB'ga ishonadi, lekin buni ikkinchi marta
    // tekshirish arzon: bo'lim ro'yxati ekranda ketma-ket ko'rinishi
    // shart, tasodifiy tartib bo'lim raqamlarini chalkashtirib yuboradi.
    const sectionGruppen = [...sections]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        order: s.order,
        code: s.code,
        titleUz: s.titleUz,
        titleDe: s.titleDe,
        lessons: bySection.get(s.id) ?? [],
      }));

    const { retiredAt: _retiredAt, ...publicUnit } = unit;

    return {
      ...publicUnit,
      label: LEVEL_LABEL[unit.level],
      // Yassi ro'yxat QOLADI: nafaqaga chiqarilgan 20 ta eski DiB
      // unitining darslarida `sectionId` yo'q, ular faqat shu yerda
      // ko'rinadi. O'chirilsa o'sha unitlar bo'shab qolardi.
      lessons: alle,
      sections: sectionGruppen,
      finalTest,
    };
  }

  /**
   * Bitta dars: lug'at yoki grammatika izohi, so'ng mashqlar.
   *
   * TO'G'RI JAVOB QAYTARILMAYDI. Uni yuborish mashqning ma'nosini
   * yo'qotardi — brauzerdagi tarmoq oynasida ko'rinib turardi. Javob
   * faqat urinish yozilganda, serverda tekshiriladi.
   *
   * Nafaqaga chiqarilgan mashq ro'yxatga tushmaydi, lekin bazada qoladi:
   * unga ishora qiluvchi urinish tarixi saqlanadi.
   */
  async getLesson(lessonId: number) {
    const lesson = await this.prisma.dafLesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        order: true,
        tier: true,
        titleDe: true,
        titleUz: true,
        unit: { select: { id: true, titleUz: true, level: true } },
        grammar: {
          select: {
            id: true,
            code: true,
            titleDe: true,
            titleUz: true,
            explanationUz: true,
            explanationEn: true,
          },
        },
      },
    });
    if (!lesson) throw new NotFoundException('Dars topilmadi');

    const [lexemes, exercises] = await Promise.all([
      this.prisma.dafLexeme.findMany({
        where: { lessonId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          de: true,
          uz: true,
          audioKey: true,
          audioStartMs: true,
          audioEndMs: true,
          imageKey: true,
        },
      }),
      this.prisma.dafExercise.findMany({
        where: { lessonId, retiredAt: null },
        orderBy: [{ sourceSetCode: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          kind: true,
          prompt: true,
          options: true,
          answerStatus: true,
        },
      }),
    ]);

    return {
      ...lesson,
      label: LEVEL_LABEL[lesson.unit.level],
      lexemes: lexemes.map((l) => ({
        id: l.id,
        de: l.de,
        uz: l.uz,
        audioUrl: this.mediaUrl(l.audioKey),
        // Oraliq — so'zning fayl ichidagi o'rni. Usiz tugma butun
        // bo'limni ketma-ket eshittirardi.
        audioStartMs: l.audioStartMs,
        audioEndMs: l.audioEndMs,
        imageUrl: this.mediaUrl(l.imageKey),
      })),
      exercises,
    };
  }

  /**
   * Grammatika mavzulari — 92 sahifaning hammasi.
   *
   * Bu ro'yxat kamchilikni yopadi: mashqlarning 459 tasi (39 %) hech
   * qaysi bo'limga tegishli emas, chunki ularning sahifasini hech qaysi
   * bob o'z mavzusi deb ko'rsatmagan. Bo'lim yo'li ularni ko'rsatmaydi;
   * bu ro'yxat ko'rsatadi.
   */
  async getGrammarIndex() {
    const rows = await this.prisma.dafGrammar.findMany({
      // `code` endi ixtiyoriy (yangi unit qoidalarida `null`) — NULL
      // tartiblash bazaga bog'liq va ekranda qoidalarni tasodifiy
      // aralashtirib yuborardi. `sourceId` har qatorda bor va eski
      // qoidalarda `code` bilan bir xil qiymatga ega edi, shuning uchun
      // eski tartib o'zgarmaydi.
      orderBy: [{ level: 'asc' }, { sourceId: 'asc' }],
      select: {
        id: true,
        code: true,
        titleDe: true,
        titleUz: true,
        level: true,
        unitId: true,
        _count: { select: { exercises: true } },
      },
    });

    return rows.map((g) => ({
      id: g.id,
      code: g.code,
      titleDe: g.titleDe,
      titleUz: g.titleUz,
      level: g.level,
      /** Yo'lda ko'rinadimi — yo'q bo'lsa faqat shu ro'yxatdan ochiladi. */
      inPath: g.unitId !== null,
      exerciseCount: g._count.exercises,
    }));
  }
}
