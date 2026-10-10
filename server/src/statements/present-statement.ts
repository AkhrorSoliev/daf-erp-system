import { applyDiscount } from '../billing/monthly-price';
import { DEFAULT_PACK_SIZE, monthOf, nextMonthKey } from './statement-months';
import {
  METHOD_LABEL,
  dayName,
  dm,
  dmy,
  monthName,
  monthTitle,
  signed,
  som,
} from './statement-text';
import {
  dueLedger,
  type DuesTotalView,
  type DueView,
  type Tone,
} from './present-dues';
import type {
  DueRef,
  ItemKind,
  ModelChange,
  MonthKey,
  SharpReason,
  StatementModel,
  StatementMonth,
  StatementNote,
} from './statement.types';

export type Voice = 'student' | 'admin';

export type { DuesTotalView, DueView, Tone };

export interface Segment {
  text: string;
  bold?: boolean;
  tone?: Tone;
}

export interface StatementView {
  title: string;
  studentLine: string;
  asOfLine: string;
  answer: { tone: 'debt' | 'credit' | 'zero'; title: string; subtitle: string };
  equation: Segment[];
  dues: DueView[];
  /** Null when the rows alone do not add up to the answer box. */
  duesTotal: DuesTotalView | null;
  /** Money on the account beyond every charge. */
  surplus: { label: string; amount: string } | null;
  sharpNote: Segment[] | null;
  /** The payments alone, oldest first, each with where it went. */
  payments: Array<{
    date: string;
    what: string;
    amount: string;
    to: string;
    paymentId: string | null;
  }>;
  /** Their sum; null when there are none. */
  paidTotal: string | null;
  /** How to read the statement, one sentence each. */
  notes: string[];
  /** Admin only: the statement does not reconcile to the balance. */
  warning: string | null;
}

const WORDS = {
  student: {
    debt: 'Qarzingiz',
    noDebt: "Qarzingiz yo'q.",
    credit: (x: string) =>
      `Qarzingiz yo'q. Hisobingizda ${x} so'm ortiqcha pul bor.`,
    zero: "Hisobingiz nolda: qarz ham, ortiqcha pul ham yo'q.",
    paid: "To'lagansiz",
    lessons: 'darslaringiz narxi',
    onAccount: 'hisobingizda',
    midMonth:
      "Oy o'rtasida qo'shilsangiz, faqat qo'shilgan kundan boshlab darslar hisoblanadi.",
    youLeft: 'chiqqansiz',
    yourDiscount: 'sizga ',
    surplus: 'Hisobingizda ortiqcha pul',
    notes: [
      "To'lovingiz avval eng eski to'lanmagan oyga yoziladi.",
      '«Kelmagan» — sababsiz qoldirilgan dars. U ham hisoblanadi.',
      "Hujjat tizim tomonidan avtomatik tuzilgan. Savol bo'lsa, filial administratoriga murojaat qiling.",
    ],
  },
  admin: {
    debt: 'Qarzi',
    noDebt: "Qarzi yo'q.",
    credit: (x: string) => `Qarzi yo'q. Hisobida ${x} so'm ortiqcha pul bor.`,
    zero: "Hisobi nolda: qarz ham, ortiqcha pul ham yo'q.",
    paid: "To'lagan",
    lessons: 'darslari narxi',
    onAccount: 'hisobida',
    midMonth:
      "Oy o'rtasida qo'shilsa, qo'shilgan kundan boshlab darslar hisoblanadi.",
    youLeft: 'chiqqan',
    yourDiscount: '',
    surplus: 'Hisobida ortiqcha pul',
    notes: [
      "To'lov avval eng eski to'lanmagan oyga yoziladi.",
      '«Kelmagan» — sababsiz qoldirilgan dars. U ham hisoblanadi.',
    ],
  },
};

const ITEM: Record<ItemKind, { student: string; admin: string }> = {
  // ADR-0077: at the request the money has not been handed over yet, and it
  // may leave by card — so neither «naqd» nor «berildi».
  refund: { student: 'pul qaytarish', admin: 'pul qaytarish' },
  'mock-fee': { student: 'mock imtihon', admin: 'mock imtihon' },
  'debt-write-off': { student: 'qarz kechirildi', admin: 'qarz kechirildi' },
  'balance-withdrawal': {
    student: 'balansdan olindi',
    admin: 'balansdan olindi',
  },
  discount: {
    student: "chegirma (o'tgan darslar qayta hisoblandi)",
    admin: "chegirma (o'tgan darslar qayta hisoblandi)",
  },
  'initial-balance': {
    student: "boshlang'ich balans",
    admin: "boshlang'ich balans",
  },
  correction: { student: "to'g'rilash", admin: "to'g'rilash" },
  unexplained: { student: 'boshqa tuzatish', admin: 'tushuntirilmagan farq' },
  rounding: { student: 'yaxlitlash farqi', admin: 'yaxlitlash farqi' },
};

const WHY: Record<StatementNote['why'], string> = {
  'left-group': 'guruhdan chiqqanda',
  'group-change': 'guruh almashganda',
  frozen: 'muzlatilganda',
  expelled: "o'qishdan chetlatilganda",
  'group-closed': 'guruh yopilganda',
  switch: "oylik to'lovga o'tishda",
  refund: 'pul qaytarib olinganda',
  other: '',
};

const itemLabel = (kind: ItemKind, voice: Voice) => ITEM[kind][voice];

function releaseText(n: StatementNote): string {
  const count = n.lessons ? `${n.lessons} ` : '';
  const what =
    n.kind === 'prepaid-release'
      ? `paketdagi o'tilmagan ${count}dars puli qaytarildi`
      : `o'tilmagan ${count}dars puli qaytarildi`;
  return [WHY[n.why], what].filter(Boolean).join(' ');
}

export function dueLabel(due: DueRef, voice: Voice): string {
  if (due.kind === 'month') return monthName(due.month);
  if (due.kind === 'item')
    return `${itemLabel(due.itemKind, voice)} (${dm(due.day)})`;
  return "oldindan to'langan, hali o'tilmagan darslar";
}

/**
 * The lines under a month. A full month's price needs no line (the notes say
 * the monthly price once), and `coverage` is what closed part of the month
 * without a payment. An excused lesson is stated only once it has reduced a
 * charge: the centre gives no such credit while the monthly cap is 0, so a
 * lesson still waiting is not promised to anyone.
 */
function monthDetails(m: StatementMonth, coverage: string[]): string[] {
  const out: string[] = [];
  const several = m.monthlyParts.length > 1;
  for (const p of m.monthlyParts) {
    const prefix = several ? `${p.group}: ` : '';
    if (p.fromDay && p.lessons < p.planned) {
      out.push(
        `${prefix}oylik to'lov: ${dayName(p.fromDay)}dan, ${p.planned} darsdan ${p.lessons} tasi × ${som(p.perLesson)}`,
      );
    } else if (several) {
      out.push(
        `${prefix}oylik to'lov: ${p.lessons} dars × ${som(p.perLesson)}`,
      );
    }
    if (p.creditLessons > 0) {
      out.push(
        `o'tgan oydagi uzrli ${p.creditLessons} dars uchun −${som(p.creditAmount)}`,
      );
    }
  }
  const upcoming = m.lessonDays.filter((d) => d.status === 'kelgusi').length;
  if (m.monthlyParts.length > 0 && upcoming > 0) {
    out.push(
      `${upcoming} dars hali o'tilmagan — oylik to'lov oy boshida yoziladi`,
    );
  }
  const pack = m.packParts.filter((p) => p.lessons > 0);
  if (m.monthlyParts.length > 0) {
    for (const p of pack) {
      out.push(
        `${p.group} guruhda ${p.lessons} dars (${p.days.map(dayName).join(', ')}) eski usulda — ${som(p.cost)}`,
      );
    }
  } else if (new Set(pack.map((p) => p.group)).size > 1) {
    const byGroup = new Map<string, number>();
    for (const p of pack)
      byGroup.set(p.group, (byGroup.get(p.group) ?? 0) + p.lessons);
    out.push([...byGroup].map(([g, n]) => `${g} guruhda ${n} dars`).join(', '));
  }
  out.push(...coverage);
  for (const n of m.notes) {
    out.push(
      `${dm(n.day)}: ${releaseText(n)} (${som(n.amount)}) — bu darslar hisobga kirmagan`,
    );
  }
  return out;
}

function reasonText(
  r: SharpReason,
  month: MonthKey,
  vs: MonthKey,
  packSize: number,
): string {
  switch (r.kind) {
    case 'lessons':
      return `darslar soni ${r.now} ta (${monthName(vs)}da ${r.before} ta)`;
    case 'price':
      return `1 dars narxi ${som(r.before)} → ${som(r.now)}`;
    case 'left':
      return r.frozen
        ? `${dayName(r.day)}da ${r.group} guruhda muzlatilgan`
        : `${dayName(r.day)}da ${r.group} guruhdan chiqqan`;
    case 'joined':
      return (
        `${dayName(r.day)}dan ${r.group} guruhda o'qiydi` +
        (r.awaySince
          ? ` (${dayName(r.awaySince)}dan beri darsda bo'lmagan)`
          : '')
      );
    case 'model':
      return r.to === 'MONTHLY'
        ? `${monthName(month)}dan oylik to'lov`
        : `${monthName(month)}dan ${packSize} darslik paket`;
  }
}

function modelChangeView(
  c: ModelChange,
  model: StatementModel,
  voice: Voice,
): { title: string; lines: string[] } {
  const w = WORDS[voice];
  const size =
    model.packEra?.size ??
    model.student.course?.lessonPaymentCount ??
    DEFAULT_PACK_SIZE;
  if (c.to === 'LESSON_PACK') {
    return {
      title: `${monthTitle(c.month)}dan ${size} darslik paket`,
      lines: [
        `${monthTitle(c.month)}dan to'lov ${size} darslik paket bilan: pul paketga to'lanadi va har dars o'tilganda paketdan yechiladi.`,
      ],
    };
  }
  const lines: string[] = [];
  const course = model.student.course;
  const d = model.student.discountPercent;
  if (course && course.paymentModel === 'MONTHLY') {
    lines.push(
      `${monthTitle(c.month)}dan to'lov oyiga bir marta: ${som(course.price)} so'm` +
        (d > 0
          ? `, ${w.yourDiscount}${d}% chegirma bilan ${som(applyDiscount(course.price, d))} so'm`
          : '') +
        ` — guruhning shu oydagi hamma darslari uchun. ${w.midMonth}`,
    );
  }
  if (c.oldCharged > 0) {
    lines.push(
      `${monthTitle(c.month)} darslari uchun eski usulda yechilgan ${som(c.oldCharged)} so'm qaytarildi, ` +
        `o'rniga oylik to'lov ${som(c.newCharged)} so'm yozildi (${c.newLessons} dars).`,
    );
  }
  if (c.carriedIn) {
    lines.push(
      `${c.carriedIn.lessons} ta ${monthName(c.month)} darsi eski usulda ham to'langan edi — ` +
        `ikki marta olinmasligi uchun uning puli ${som(c.carriedIn.amount)} so'm qaytarildi.`,
    );
  }
  for (const p of c.otherGroupPack) {
    const lesson = p.days.length > 1 ? 'darslari' : 'darsi';
    lines.push(
      `${p.days.map(dayName).join(', ')}dagi ${p.group} guruh ${lesson} eski usulda hisoblangan — ${som(p.cost)} so'm` +
        (p.leftDay
          ? ` (bu guruhdan ${dayName(p.leftDay)}da ${w.youLeft})`
          : '') +
        '.',
    );
  }
  return { title: `${monthTitle(c.month)}dan oylik to'lov`, lines };
}

export function presentStatement(
  model: StatementModel,
  voice: Voice,
): StatementView {
  const w = WORDS[voice];
  const last = model.months[model.months.length - 1];
  const nextFee = monthName(nextMonthKey(monthOf(model.asOf)));
  const size = model.packEra?.size ?? DEFAULT_PACK_SIZE;

  const course = model.student.course;
  const d = model.student.discountPercent;
  const discounted = (price: number) =>
    d > 0 ? `, ${d}% chegirma bilan ${som(applyDiscount(price, d))} so'm` : '';
  const courseText = !course
    ? ''
    : course.paymentModel === 'MONTHLY'
      ? ` · ${course.name} — oyiga ${som(course.price)} so'm${discounted(course.price)}`
      : ` · ${course.name} — ${course.lessonPaymentCount} dars ${som(course.price)} so'm${discounted(course.price)}`;
  const groups =
    model.student.groups.length > 0
      ? ` · ${model.student.groups.join(', ')} guruh`
      : '';

  let answer: StatementView['answer'];
  if (model.headline.kind === 'debt') {
    const parts = model.headline.unpaid.map(({ due, amount }) => {
      if (due.kind === 'month') {
        return due.month === last?.key
          ? `${monthName(due.month)} darslari uchun ${som(amount)}`
          : `${monthName(due.month)}dan qolgan ${som(amount)}`;
      }
      if (due.kind === 'item')
        return `${itemLabel(due.itemKind, voice)} (${dm(due.day)}) ${som(amount)}`;
      return `paketdagi hali o'tilmagan darslar uchun ${som(amount)}`;
    });
    answer = {
      tone: 'debt',
      title: `${w.debt}: ${som(model.headline.amount)} so'm`,
      subtitle: parts.join(' · '),
    };
  } else if (model.headline.kind === 'credit') {
    answer = {
      tone: 'credit',
      title: w.credit(som(model.headline.amount)),
      subtitle: `U ${nextFee} to'loviga o'tadi.`,
    };
  } else {
    answer = { tone: 'zero', title: w.noDebt, subtitle: w.zero };
  }

  const eq = model.equation;
  const equation: Segment[] = [
    { text: `${w.paid} ` },
    { text: som(eq.paid), bold: true },
  ];
  for (const it of eq.items.filter((i) => i.amount > 0)) {
    equation.push(
      { text: ` + ${itemLabel(it.kind, voice)} ` },
      { text: som(it.amount), bold: true },
    );
  }
  equation.push(
    { text: ` − ${w.lessons} ` },
    { text: som(eq.lessons), bold: true },
  );
  for (const it of eq.items.filter((i) => i.amount < 0)) {
    equation.push(
      { text: ` − ${itemLabel(it.kind, voice)} ` },
      { text: som(it.amount), bold: true },
    );
  }
  if (eq.prepaidAhead > 0) {
    equation.push(
      { text: " − oldindan to'langan darslar " },
      { text: som(eq.prepaidAhead), bold: true },
    );
  }
  equation.push(
    { text: ' = ' },
    {
      text: eq.balance === 0 ? '0' : signed(eq.balance),
      bold: true,
      tone: eq.balance > 0 ? 'green' : eq.balance < 0 ? 'red' : 'muted',
    },
  );

  const ledger = dueLedger(model, (kind) => itemLabel(kind, voice));
  const dues: DueView[] = [];

  model.months.forEach((m, i) => {
    const preOnly =
      m.preSystem !== null && m.lessons === 0 && m.cost === 0 && m.money === 0;
    const quiet = !preOnly && m.lessons === 0 && m.cost === 0;
    const isLast = i === model.months.length - 1;
    const lessons = `${preOnly ? m.preSystem!.lessons : m.lessons} ta`;
    const cost =
      preOnly || quiet ? null : m.cost < 0 ? signed(m.cost) : som(m.cost);
    const costNote = preOnly
      ? "tizimga qadar to'langan"
      : quiet
        ? "hisoblangan dars yo'q"
        : null;
    const settled = m.cost > 0 ? ledger.settle(m.key, m.cost) : null;
    const excused = m.lessonDays.filter((d) => d.status === 'uzrli').length;
    const marks = preOnly
      ? []
      : [
          m.absent > 0 ? `${m.absent} kelmagan` : '',
          excused > 0 ? `${excused} uzrli` : '',
        ].filter(Boolean);
    dues.push({
      key: m.key,
      label: monthTitle(m.key),
      wide: false,
      bold: isLast,
      lessons,
      lessonsNote: marks.length > 0 ? marks.join(' · ') : null,
      cost,
      costNote,
      paid: settled?.paid ?? '',
      left: settled?.left ?? '',
      leftTone: settled?.leftTone ?? 'muted',
      details: preOnly ? [] : monthDetails(m, settled?.coverage ?? []),
      highlight: m.sharp !== null,
    });
  });
  dues.push(...ledger.extraRows());

  const sharp = last?.sharp ?? null;
  const sharpNote: Segment[] | null =
    last && sharp
      ? [
          {
            text: `${monthTitle(last.key)} ${monthName(sharp.vs)}dan ${som(sharp.diff)} so'm ${sharp.diff > 0 ? "ko'p" : 'kam'}.`,
            bold: true,
          },
          ...(sharp.reasons.length > 0
            ? [
                {
                  text: ` Sababi: ${sharp.reasons.map((r) => reasonText(r, last.key, sharp.vs, size)).join('; ')}.`,
                },
              ]
            : []),
        ]
      : null;

  const paidRows = model.allocations.filter((a) => a.kind === 'payment');
  const payments = paidRows.map((a) => {
    // Spent whole on one due: its amount is already on the row, say it once.
    const whole = a.to.length === 1 && a.leftover === 0;
    const to = a.to
      .map((t) =>
        whole
          ? dueLabel(t.due, voice)
          : `${dueLabel(t.due, voice)} ${som(t.amount)}`,
      )
      .join(', ');
    const leftover =
      a.leftover > 0
        ? `ortig'i ${som(a.leftover)} ${w.onAccount} (${nextFee} to'loviga)`
        : '';
    return {
      date: dmy(a.day),
      what: METHOD_LABEL[a.method ?? ''] ?? "To'lov",
      amount: som(a.amount),
      to: [to, leftover].filter(Boolean).join(' · '),
      paymentId: a.paymentId,
    };
  });

  const packHint = !model.packEra
    ? null
    : (model.packEra.until
        ? `${monthTitle(model.packEra.until)}gacha pul ${size} darslik paket uchun to'lanardi.`
        : `Pul ${size} darslik paket uchun to'lanadi.`) +
      ` Jadvalda esa har dars o'tilgan oyiga yozilgan, shuning uchun bir oyda ${size} tadan ko'p yoki kam dars bo'lishi mumkin.`;

  const changeLines = model.modelChanges.flatMap(
    (c) => modelChangeView(c, model, voice).lines,
  );

  return {
    title: "To'lovlar hisoboti",
    studentLine: `${model.student.name} · ID ${model.student.id}${groups}${courseText}`,
    asOfLine: `DaF Sprachzentrum · ${dmy(model.asOf)} holatiga`,
    answer,
    equation,
    dues,
    duesTotal: ledger.total(),
    surplus:
      model.headline.kind === 'credit'
        ? { label: w.surplus, amount: `+${som(model.headline.amount)}` }
        : null,
    sharpNote,
    payments,
    paidTotal:
      paidRows.length > 0
        ? som(paidRows.reduce((s, a) => s + a.amount, 0))
        : null,
    notes: [...(packHint ? [packHint] : []), ...changeLines, ...w.notes],
    warning:
      voice === 'admin' && eq.unexplained !== 0
        ? `Hisobot balans bilan ${signed(eq.unexplained)} so'm farq qildi va «tushuntirilmagan farq» qatori qo'shildi. Dasturchiga xabar bering.`
        : null,
  };
}
