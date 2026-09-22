/**
 * Lid voronkasining sof hisob mantig'i — ma'lumotlar bazasiz sinaladi.
 *
 * Birlik — ODAM, lid qatori emas. ADR-0017 dan keyin bir o'quvchiga bir nechta
 * lid bog'lanishi mumkin (telefon bo'yicha eski kartochkaga ulanish), va ularni
 * alohida sanash birinchi blokni shishirib, konversiyani yolg'on pasaytirardi.
 */

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
  createdAt: Date;
}

export interface StageSets {
  enrolled: Set<number>;
  attended: Set<number>;
  paid: Set<number>;
}

export function toPersons(leads: CohortLead[]): FunnelPerson[] {
  const byKey = new Map<string, FunnelPerson>();

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
        createdAt: l.createdAt,
      });
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
function depthOf(person: FunnelPerson, sets: StageSets): number {
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
    const depth = depthOf(p, sets);
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
      const depth = depthOf(p, sets);
      return mode === 'stuck' && !isLast ? depth === target : depth >= target;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
