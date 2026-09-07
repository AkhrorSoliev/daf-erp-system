import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DafLessonKind, DafLevel } from '@prisma/client';
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

/** Bitta seans — bo'lim ichidagi ham, yakuniy sinov ham shu shaklda. */
export interface LernenSeansItem {
  id: number;
  order: number;
  tier: number | null;
  kind: DafLessonKind | null;
  titleDe: string;
  titleUz: string | null;
  wordCount: number;
  exerciseCount: number;
  completedAt: Date | null;
  bestScore: number;
  runs: number;
}

/** Bo'lim guruhi — sarlavha + o'sha bo'limdagi seanslar. */
export interface BolimGuruhi {
  id: number;
  order: number;
  code: string;
  titleUz: string;
  titleDe: string;
  lessons: LernenSeansItem[];
}

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
    // Yo'l zigzagida har seans o'z tugunini oladi — shuning uchun yo'l
    // sahifasi ham bo'lim ekrani bilan bir xil `sections`/`finalTest`
    // shaklini oladi, alohida 12 ta so'rov o'rniga.
    sections: BolimGuruhi[];
    finalTest: LernenSeansItem | null;
  }[];
}

/** `gruppiereLektionen` ga beriladigan xom qatorlar — DB select shakli. */
interface XomDars {
  id: number;
  order: number;
  tier: number | null;
  kind: DafLessonKind | null;
  sectionId: number | null;
  titleDe: string;
  titleUz: string | null;
  _count: { lexemes: number; exercises: number };
}

interface XomBolim {
  id: number;
  order: number;
  code: string;
  titleUz: string;
  titleDe: string;
}

interface XomFortschritt {
  lessonId: number;
  completedAt: Date | null;
  bestScore: number;
  runs: number;
}

@Injectable()
export class DafPortalReadService {
  private readonly logger = new Logger(DafPortalReadService.name);

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

    // Yo'l endi seanslarni o'zi ko'rsatadi (Duolingo uslubidagi zigzag),
    // shuning uchun har unitning bo'limlari ham shu javobga kerak. Buni
    // unit boshiga bittadan so'rov bilan qilish 12 unitda 12 (yoki
    // ilgarilash bilan 24) ta so'rov degani edi. O'rniga bo'limlar va
    // darslar BARCHA unitlar uchun BITTADAN so'rov bilan olinadi
    // (`unitId: { in: unitIds } }`), so'ng xotirada unit bo'yicha
    // guruhlanadi.
    const unitIds = units.map((u) => u.id);
    const sections = await this.prisma.dafSection.findMany({
      where: { unitId: { in: unitIds } },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        unitId: true,
        order: true,
        code: true,
        titleUz: true,
        titleDe: true,
      },
    });
    const lessons = await this.prisma.dafLesson.findMany({
      where: { unitId: { in: unitIds } },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        unitId: true,
        order: true,
        tier: true,
        kind: true,
        sectionId: true,
        titleDe: true,
        titleUz: true,
        _count: { select: { lexemes: true, exercises: true } },
      },
    });
    // BITTA ilgarilash so'rovi ikkala maqsadga xizmat qiladi: yo'l
    // kartasidagi `4/18` sonini ham, har seansga yopishtiriladigan
    // to'liq yozuvni (`bestScore`, `runs`, `completedAt`) ham shu
    // ro'yxatdan olamiz — `getUnit`dagidek, TUGALLANMAGAN urinish ham
    // hisobga olinishi kerak, shuning uchun `completedAt` bo'yicha
    // filtr yo'q.
    const fortschritt = await this.prisma.dafLessonProgress.findMany({
      where: { studentId, lesson: { unitId: { in: unitIds } } },
      select: {
        lessonId: true,
        completedAt: true,
        bestScore: true,
        runs: true,
      },
    });

    const bolimlarByUnit = new Map<number, XomBolim[]>();
    for (const s of sections) {
      const list = bolimlarByUnit.get(s.unitId) ?? [];
      list.push(s);
      bolimlarByUnit.set(s.unitId, list);
    }
    const darslarByUnit = new Map<number, XomDars[]>();
    const unitByLesson = new Map<number, number>();
    for (const l of lessons) {
      const list = darslarByUnit.get(l.unitId) ?? [];
      list.push(l);
      darslarByUnit.set(l.unitId, list);
      unitByLesson.set(l.id, l.unitId);
    }

    // Tugallangan seanslar SANALADI, ro'yxati kerak emas: yo'l kartasida
    // faqat `4/18` ko'rinadi. Yuqoridagi `fortschritt`dan xotirada
    // hisoblanadi — `completedAt` bor qatorlar, `lessons` orqali o'z
    // unitiga bog'lanadi.
    const bajarilganSoni = new Map<number, number>();
    for (const f of fortschritt) {
      if (!f.completedAt) continue;
      const u = unitByLesson.get(f.lessonId);
      if (u != null) bajarilganSoni.set(u, (bajarilganSoni.get(u) ?? 0) + 1);
    }

    return LEVEL_ORDER.map((level) => ({
      level,
      label: LEVEL_LABEL[level],
      units: units
        .filter((u) => u.level === level)
        .map((u) => {
          const guruh = this.gruppiereLektionen(
            u.id,
            darslarByUnit.get(u.id) ?? [],
            bolimlarByUnit.get(u.id) ?? [],
            fortschritt,
          );
          return {
            id: u.id,
            order: u.order,
            titleUz: u.titleUz,
            titleDe: u.titleDe,
            lessonCount: u._count.lessons,
            doneCount: bajarilganSoni.get(u.id) ?? 0,
            sections: guruh.sections,
            finalTest: guruh.finalTest,
          };
        }),
    }));
  }

  /**
   * Darslarni bo'lim bo'yicha guruhlaydi, yakuniy sinovni ajratadi va
   * o'quvchining ilgarilashini har seansga yopishtiradi — bitta unit
   * uchun.
   *
   * `getUnit` (bitta unit sahifasi) ham, `getLevels` (butun yo'l, har
   * unitga) ham shu metodni chaqiradi: guruhlash mantiqi FAQAT shu yerda
   * yozilgan. Ikkinchi nusxasi yozilsa, ikkalasi asta-sekin bir-biridan
   * farqlanib ketardi — bittasiga tuzatish kiritilib, ikkinchisi
   * eskirib qolardi.
   */
  private gruppiereLektionen(
    unitId: number,
    lessons: XomDars[],
    sections: XomBolim[],
    fortschritt: XomFortschritt[],
  ): {
    lessons: LernenSeansItem[];
    sections: BolimGuruhi[];
    finalTest: LernenSeansItem | null;
  } {
    const byLesson = new Map(fortschritt.map((f) => [f.lessonId, f]));

    const toItem = (l: XomDars): LernenSeansItem => {
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
    // dizaynda oxirida alohida turadi. `.find()` faqat BIRINCHISINI
    // oladi — bu me'yorda ziyon emas (bitta unitda bitta yakuniy sinov
    // bo'lishi kerak), lekin seed xatosi bilan ikkinchisi paydo bo'lsa,
    // u sahifada UMUMAN ko'rinmasdan qoladi. Shuning uchun bu holat
    // pastda ogohlantiriladi — aks holda xato sukut saqlab yo'qolib
    // ketardi.
    const unitTests = alle.filter((l) => l.kind === 'UNIT_TEST');
    if (unitTests.length > 1) {
      this.logger.warn(
        `Unit ${unitId}da ${unitTests.length} ta UNIT_TEST darsi bor — ` +
          `faqat birinchisi (dars ${unitTests[0].id}) ko'rsatiladi, ` +
          `qolganlari (dars ${unitTests
            .slice(1)
            .map((l) => l.id)
            .join(', ')}) sahifada ko'rinmaydi. Bu seed xatosi — bitta ` +
          "unitda bitta yakuniy sinov bo'lishi kerak.",
      );
    }
    const finalTest = unitTests[0] ?? null;

    const bySection = new Map<number, LernenSeansItem[]>();
    for (const item of alle) {
      if (item.kind === 'UNIT_TEST') continue;
      const raw = lessons.find((l) => l.id === item.id)!;
      if (raw.sectionId == null) {
        // Bu unitda sectionlar UMUMAN yo'q bo'lsa (eski, nafaqaga
        // chiqarilmagan DiB darsi kabi) bu me'yor — pastdagi yassi
        // `lessons` ro'yxati orqali ko'rinadi. Lekin unitda BOSHQA
        // darslar sectionga ega bo'lsa, bu SEEDING XATOSI: sahifa
        // `sections` bo'sh bo'lmagan unitda faqat bo'lim guruhlarini
        // ko'rsatadi, yassi ro'yxatga qaramaydi — demak bu dars
        // ekranda UMUMAN ko'rinmay qoladi.
        if (sections.length > 0) {
          this.logger.warn(
            `Unit ${unitId}, dars ${item.id} (${item.titleUz}) sectionId'siz, ` +
              "lekin bu unitda boshqa bo'limlar bor — dars sahifada ko'rinmaydi.",
          );
        }
        continue;
      }
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

    return { lessons: alle, sections: sectionGruppen, finalTest };
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

    // Guruhlash mantiqi `getLevels` bilan BIR XIL xususiy metodda — u
    // yerda ham har unit shu tarzda guruhlanadi. Ikkala joyda alohida
    // yozilsa, ular asta-sekin bir-biridan farqlanib ketardi.
    const {
      lessons: alle,
      sections: sectionGruppen,
      finalTest,
    } = this.gruppiereLektionen(unitId, lessons, sections, fortschritt);

    const { retiredAt: _retiredAt, ...publicUnit } = unit;

    return {
      ...publicUnit,
      label: LEVEL_LABEL[unit.level],
      // Yassi ro'yxat QOLADI — lekin NAFAQAGA CHIQARILGAN 20 ta eski DiB
      // uniti uchun emas: shu funksiya yuqorida `retiredAt` bor unitni
      // 404 bilan rad etadi (test bilan tasdiqlangan), shuning uchun
      // ularning yassi ro'yxatiga hech qachon yetib bo'lmaydi. Haqiqiy
      // sabab — TIRIK unit ham sectionsiz dars tashib yurishi mumkin
      // (seeding xatosi, yuqoridagi ogohlantirishga qarang): bunday
      // holatda bo'lim guruhlari o'sha darsni ko'rsatmaydi, va yagona
      // joy shu yassi ro'yxat.
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
