/**
 * Lid voronkasining sof hisob mantig'i — ma'lumotlar bazasiz sinaladi.
 *
 * Birlik — ODAM, lid qatori emas. ADR-0017 dan keyin bir o'quvchiga bir nechta
 * lid bog'lanishi mumkin (telefon bo'yicha eski kartochkaga ulanish), va ularni
 * alohida sanash birinchi blokni shishirib, konversiyani yolg'on pasaytirardi.
 */

import {
  addDaysToDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';

export const FUNNEL_STAGES = ['lead', 'enrolled', 'attended', 'paid'] as const;

/**
 * Voronka shu kundan boshlab sanaydi (CEO qarori, 13.09.2026).
 *
 * 10.09.2026 dan har bir yangi o'quvchi lid yozuvi qoldiradi — doskadan,
 * to'g'ridan qo'shilgan va botdan kelgan (ADR-0018). Undan oldingi davrda
 * to'g'ridan kelganlar lidsiz, ya'ni voronka yarim bo'lardi. Eski o'quvchilarga
 * orqaga qarab lid yaratilmagan («faqat bugundan boshlaymiz»), shuning uchun
 * oldingi davr ko'rsatilmaydi — izoh bilan emas, umuman.
 * Klientdagi nusxasi: client/src/components/reports/lead-funnel/lead-funnel-math.ts
 */
export const FUNNEL_START_DATE = '2026-09-10';
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export type FunnelMode = 'all' | 'stuck';

export interface CohortLead {
  id: string;
  studentId: number | null;
  /** Doskadan kelganmi (`sectionId` bor). `false` — tizim yaratgan kelib chiqish yozuvi. */
  board: boolean;
  firstName: string;
  lastName: string;
  phone: string;
  source: string | null;
  sourceId: string | null;
  branchId: number | null;
  branchName: string | null;
  createdAt: Date;
}

export interface FunnelPerson {
  key: string;
  leadId: string;
  studentId: number | null;
  board: boolean;
  name: string;
  phone: string;
  source: string | null;
  sourceId: string | null;
  branchId: number | null;
  branchName: string | null;
  createdAt: Date;
}

export interface StageSets {
  enrolled: Set<number>;
  attended: Set<number>;
  paid: Set<number>;
}

export function toPersons(leads: CohortLead[]): FunnelPerson[] {
  const byKey = new Map<string, FunnelPerson>();
  // Odamning joriy filiali qaysi lidning natijasi ekanini kuzatadi. Lidlar
  // xronologik tartibda kelishi kafolatlanmagan (servis so'rovida `orderBy`
  // yo'q), shuning uchun filial shaxs maydonlari (ism/telefon/manba) bilan
  // bir xil «birinchi kelgan lid» mezoniga bog'lanmaydi — filiali BOR eng
  // ERTA lid g'olib chiqadi, u identifikatsiya uchun tanlangan lid bilan bir
  // xil bo'lmasa ham.
  const branchAsOf = new Map<string, Date>();

  for (const l of leads) {
    const key = l.studentId != null ? `s:${l.studentId}` : `l:${l.id}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        key,
        leadId: l.id,
        studentId: l.studentId,
        board: l.board,
        name: `${l.firstName} ${l.lastName}`.trim(),
        phone: l.phone,
        source: l.source,
        sourceId: l.sourceId,
        branchId: l.branchId,
        branchName: l.branchName,
        createdAt: l.createdAt,
      });
      if (l.branchId != null) branchAsOf.set(key, l.createdAt);
      continue;
    }

    // Bitta odamning bir nechta lidi: doskadan bittasi bo'lsa ham odam doskadan
    // kelgan, va u BIRINCHI marta kelgan vaqti bilan sanaladi. Ism, telefon
    // va manba ham o'sha birinchi liddan — bir qatorda ikki xil lid aralashmasin.
    existing.board = existing.board || l.board;
    if (l.createdAt < existing.createdAt) {
      existing.createdAt = l.createdAt;
      existing.leadId = l.id;
      existing.name = `${l.firstName} ${l.lastName}`.trim();
      existing.phone = l.phone;
      existing.source = l.source ?? existing.source;
      existing.sourceId = l.sourceId ?? existing.sourceId;
    }
    // Filial lid ochiq formadan kelganda hali noma'lum bo'ladi va keyingi
    // lidda (yoki aylantirishda) paydo bo'ladi. Bu tekshiruv shaxs
    // maydonlaridan MUSTAQIL ishlaydi: qaysi lid identifikatsiya uchun
    // «birinchi» deb tanlangani emas, balki filiali bor lidlarning o'zi
    // orasidagi eng erta sana g'olib chiqadi — massivdagi kelish tartibi
    // ahamiyatsiz.
    if (l.branchId != null) {
      const knownAsOf = branchAsOf.get(key);
      if (knownAsOf === undefined || l.createdAt < knownAsOf) {
        existing.branchId = l.branchId;
        existing.branchName = l.branchName;
        branchAsOf.set(key, l.createdAt);
      }
    }
  }

  return [...byKey.values()];
}

/**
 * Odam yetgan eng chuqur bosqich indeksi (0 = lid ... 3 = to'lov).
 *
 * QAT'IY ICHMA-ICH: har bosqich oldingisining qismi. Oldindan to'lab hali
 * darsga kelmagan odam «Guruhga yozildi» da turadi — aks holda to'lov bloki
 * davomat blokidan kattaroq chiqib, voronka torayish o'rniga kengayishi va
 * yo'qotish raqamlari manfiy bo'lishi mumkin edi.
 */
export function stageDepth(person: FunnelPerson, sets: StageSets): number {
  const id = person.studentId;
  if (id == null || !sets.enrolled.has(id)) return 0;
  if (!sets.attended.has(id)) return 1;
  if (!sets.paid.has(id)) return 2;
  return 3;
}

export function countStages(persons: FunnelPerson[], sets: StageSets) {
  const reached = [0, 0, 0, 0];
  let board = 0;

  for (const p of persons) {
    const depth = stageDepth(p, sets);
    for (let i = 0; i <= depth; i++) reached[i]++;
    if (p.board) board++;
  }

  return {
    stages: {
      lead: reached[0],
      enrolled: reached[1],
      attended: reached[2],
      paid: reached[3],
    },
    leadSplit: { board, direct: persons.length - board },
  };
}

/**
 * Bosqichga bosilganda ochiladigan ro'yxat.
 *
 * `stuck` — shu bosqichga yetib, keyingisiga o'tmaganlar: «darsga keldi, lekin
 * to'lamadi» degan amaliy ro'yxat shu. Oxirgi bosqichda keyingi bosqich yo'q,
 * shuning uchun u yerda `stuck` va `all` bir xil.
 */
export function personsAtStage(
  persons: FunnelPerson[],
  sets: StageSets,
  stage: FunnelStage,
  mode: FunnelMode,
): FunnelPerson[] {
  const target = FUNNEL_STAGES.indexOf(stage);
  const isLast = target === FUNNEL_STAGES.length - 1;

  return persons
    .filter((p) => {
      const depth = stageDepth(p, sets);
      return mode === 'stuck' && !isLast ? depth === target : depth >= target;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export const NO_SOURCE = 'none';

/**
 * To'lamaganlar ro'yxatining holat guruhlari. DTO ham, servis ham shu yerdan
 * oladi: DTO servisni import qilsa halqa bo'lardi.
 */
export const UNPAID_STATUS_BUCKETS = [
  'active',
  'frozen',
  'expelled',
  'other',
] as const;
export type UnpaidStatusBucket = (typeof UNPAID_STATUS_BUCKETS)[number];

export interface SourceBreakdownRow {
  id: string | null;
  name: string | null;
  lead: number;
  enrolled: number;
  attended: number;
  paid: number;
}

export interface BranchBreakdownRow {
  id: number | null;
  name: string | null;
  lead: number;
  paid: number;
}

/**
 * Lid soni bo'yicha kamayib; teng bo'lsa nom bo'yicha. Manbasiz/filialsiz
 * qator (nomi `null`) doim oxirida: u qoldiq to'plam, nomli manbani
 * ro'yxatning yuqori qismidan siqib chiqarmasligi kerak.
 */
function compareBreakdownRows(
  a: { lead: number; name: string | null },
  b: { lead: number; name: string | null },
): number {
  if (a.lead !== b.lead) return b.lead - a.lead;
  if (a.name === null) return b.name === null ? 0 : 1;
  if (b.name === null) return -1;
  return a.name.localeCompare(b.name);
}

/**
 * Manba bo'yicha voronka. Har odam bitta manbada (birinchi lidiniki); manbasiz
 * odamlar `id: null` qatorida. Lid soni bo'yicha kamayib, teng bo'lsa nom
 * bo'yicha — «Instagram 30 → 0» ni «Telegram bot 39 → 7» yonida ko'rsatish shu
 * hisobotning asosiy maqsadi.
 */
export function countBySource(
  persons: FunnelPerson[],
  sets: StageSets,
): SourceBreakdownRow[] {
  const rows = new Map<string, SourceBreakdownRow>();
  for (const p of persons) {
    const key = p.sourceId ?? NO_SOURCE;
    let row = rows.get(key);
    if (!row) {
      row = {
        id: p.sourceId,
        name: p.sourceId ? p.source : null,
        lead: 0,
        enrolled: 0,
        attended: 0,
        paid: 0,
      };
      rows.set(key, row);
    }
    const depth = stageDepth(p, sets);
    row.lead++;
    if (depth >= 1) row.enrolled++;
    if (depth >= 2) row.attended++;
    if (depth >= 3) row.paid++;
  }
  return [...rows.values()].sort(compareBreakdownRows);
}

/** Filial bo'yicha lid va to'lov. Filiali belgilanmagan odamlar `id: null`. */
export function countByBranch(
  persons: FunnelPerson[],
  sets: StageSets,
): BranchBreakdownRow[] {
  const rows = new Map<string, BranchBreakdownRow>();
  for (const p of persons) {
    const key = p.branchId == null ? 'none' : String(p.branchId);
    let row = rows.get(key);
    if (!row) {
      row = { id: p.branchId, name: p.branchName, lead: 0, paid: 0 };
      rows.set(key, row);
    }
    row.lead++;
    if (stageDepth(p, sets) >= 3) row.paid++;
  }
  return [...rows.values()].sort(compareBreakdownRows);
}

function daysInclusive(startDate: string, endDate: string): number {
  const ms =
    utcMidnightFromDateStr(endDate).getTime() -
    utcMidnightFromDateStr(startDate).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Tanlangan davr uzunligidagi, undan bevosita oldingi oraliq — KPI
 * kartasidagi «oldingi davr N %» uchun. Boshlanishi voronka chegarasiga
 * qirqiladi; oraliq butunlay chegaradan oldin bo'lsa `null` («oldingi davr
 * yo'q»). Oktyabr uchun bu 10.09–30.09, sentyabr uchun `null`.
 */
export function previousPeriod(period: {
  startDate: string;
  endDate: string;
}): { startDate: string; endDate: string } | null {
  const endDate = addDaysToDateStr(period.startDate, -1);
  if (endDate < FUNNEL_START_DATE) return null;
  const days = daysInclusive(period.startDate, period.endDate);
  const rawStart = addDaysToDateStr(endDate, -(days - 1));
  return {
    startDate: rawStart > FUNNEL_START_DATE ? rawStart : FUNNEL_START_DATE,
    endDate,
  };
}

/** Odamlar ro'yxatidagi manba filtri; `'none'` — manbasi yo'qlar. */
export function matchesSource(
  person: FunnelPerson,
  sourceId: string | undefined,
): boolean {
  if (sourceId === undefined) return true;
  if (sourceId === NO_SOURCE) return person.sourceId == null;
  return person.sourceId === sourceId;
}
