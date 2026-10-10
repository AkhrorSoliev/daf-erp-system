import type {
  Content,
  ContentTable,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { renderPdf } from '../../receipts/pdf/render';
import {
  fullWeekdaysLabel,
  uzMonthName,
} from '../../telegram-digest/uzbek-calendar';
import {
  CONTRACT_INCLUDES,
  CONTRACT_TEMPLATE_VERSION,
  type ContractCourseFields,
  type ContractCustomer,
  type ContractFields,
  type ContractInclude,
  type CustomerKind,
} from '../contract-fields';
import * as T from './contract-template-v1';

export interface ContractPdfInput {
  number: string;
  /** YYYY-MM-DD, the Tashkent day the contract was made. */
  contractDate: string;
  cancelled: boolean;
  templateVersion: number;
  fields: ContractFields;
}

const MM = 72 / 25.4;
const LINE = '____________________';

const GRID: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#8A8A8A',
  vLineColor: () => '#8A8A8A',
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

const INCLUDE_LABEL: Record<ContractInclude, string> = {
  DARSLIK: 'Darslik',
  MATERIALLAR: 'Materiallar',
  ICHKI_TEST: 'Ichki test',
  SERTIFIKAT: 'Sertifikat',
};

const KINDS: { kind: CustomerKind; label: string }[] = [
  { kind: 'SELF', label: "o'zi" },
  { kind: 'PARENT', label: 'ota-ona' },
  { kind: 'GUARDIAN', label: 'vasiy / homiy' },
  { kind: 'OTHER', label: 'boshqa:' },
];

export function dmy(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}`;
}

export function headerDate(day: string): string {
  const [y, m, d] = day.split('-');
  return `«${d}» ${uzMonthName(Number(m))} ${y} yil`;
}

export function som(amount: number): string {
  const digits = String(Math.round(amount)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ' ',
  );
  return `${digits} so'm`;
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local =
    digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits;
  if (local.length !== 9) return raw;
  return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

const orLine = (value: string | null | undefined, blank = LINE): string =>
  value && value.trim() ? value : blank;
const box = (on: boolean): string => (on ? '■' : '□');
const blankDate = (year: string): string => `____/____/${year}`;

/** «□ o'zi   ■ ota-ona   …» — the paper form's checkbox row, ticked. */
export function kindLine(c: ContractCustomer): string {
  return KINDS.map(({ kind, label }) => {
    const mark = `${box(c.kind === kind)} ${label}`;
    if (kind !== 'OTHER') return mark;
    return `${mark} ${c.kind === 'OTHER' ? orLine(c.kindOther, '_________') : '_________'}`;
  }).join('   ');
}

function row(label: string, value: string): TableCell[] {
  return [{ text: label, bold: true }, { text: value }];
}

function grid(
  body: TableCell[][],
  widths: (number | string)[] = [140, '*'],
): ContentTable {
  return { table: { widths, body }, layout: GRID, margin: [0, 2, 0, 6] };
}

function heading(text: string): Content {
  return { text, bold: true, fontSize: 10, margin: [0, 10, 0, 4] };
}

function caption(text: string): Content {
  return { text, bold: true, margin: [0, 4, 0, 2] };
}

/**
 * pdfmake breaks a word at a hyphen, and justified text then stretches the
 * gap after it («2- darsigacha», «6.2- band»). A non-breaking hyphen (U+2011,
 * in Inter) keeps such words whole.
 */
export function noBreakHyphens(text: string): string {
  return text.replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, '‑');
}

function paragraph(text: string): Content {
  const words = noBreakHyphens(text);
  return text.startsWith('— ')
    ? { text: words, alignment: 'justify', margin: [12, 0, 0, 2] }
    : { text: words, alignment: 'justify', margin: [0, 0, 0, 3] };
}

function line(text: string): Content {
  return { text, margin: [0, 0, 0, 2] };
}

function parties(f: ContractFields): Content[] {
  const c = f.customer;
  const self = c.kind === 'SELF';
  const contact = [c.phone ? formatPhone(c.phone) : null, c.telegram]
    .filter((v): v is string => Boolean(v))
    .join(' / ');
  const minor = `${box(f.student.isMinor)} voyaga yetmagan (18 yoshdan kichik)`;
  return [
    heading(T.SECTION_1_TITLE),
    caption(T.EXECUTOR_TITLE),
    grid([
      row('Tashkilot nomi', T.COMPANY_NAME),
      row('Filial manzili', f.branch.address),
      row('STIR', T.COMPANY_TIN),
      row('Litsenziya', T.COMPANY_LICENSE),
      row(
        'Vakil / Lavozimi',
        `${f.branch.representativeName} / ${f.branch.representativePosition}`,
      ),
    ]),
    caption(T.CUSTOMER_TITLE),
    grid([
      row('F.I.O.', c.fullName),
      row(
        "Tug'ilgan sana",
        c.birthDate ? dmy(c.birthDate) : '____/____/________',
      ),
      row('Pasport / ID seriya, raqami', orLine(c.passport)),
      row('Yashash manzili', orLine(c.address)),
      row('Telefon / Telegram', orLine(contact)),
      row('E-mail', orLine(c.email)),
    ]),
    caption(T.STUDENT_TITLE),
    grid([
      row('F.I.O.', self ? "Buyurtmachining o'zi" : f.student.fullName),
      row(
        "Tug'ilgan sana",
        self ? '—' : `${dmy(f.student.birthDate)}     ${minor}`,
      ),
      row('Vakillik asosi', kindLine(c)),
    ]),
  ];
}

function courseTable(course: ContractCourseFields, year: string): ContentTable {
  const days = fullWeekdaysLabel(course.days);
  const time =
    course.lessonStartTime && course.lessonEndTime
      ? `${course.lessonStartTime}–${course.lessonEndTime}`
      : orLine(course.lessonStartTime, '________________');
  // The term goes on its own line: a blank «____/____/2026» would otherwise
  // break at a slash.
  const discount =
    course.discountPercent > 0
      ? `${course.discountPercent} %   |   Sababi: ${orLine(course.discountReason, '______________')}\nMuddati: ${course.discountFrom ? dmy(course.discountFrom) : blankDate(year)} – ${course.discountTo ? dmy(course.discountTo) : blankDate(year)}`
      : "yo'q";
  return grid([
    row(
      'Til va daraja',
      course.level ? `${T.LANGUAGE}, ${course.level}` : T.LANGUAGE,
    ),
    row('Kurs turi', course.courseName),
    row(
      'Guruh / pedagog',
      course.teachers.length
        ? `${course.groupName} / ${course.teachers.join(', ')}`
        : course.groupName,
    ),
    row('Kurs boshlanish sanasi', dmy(course.startDate)),
    row(
      'Dars jadvali',
      `Kunlar: ${orLine(days, '_______________')}   Vaqt: ${time}`,
    ),
    row(
      'Haftasiga darslar soni',
      `${course.lessonsPerWeek > 0 ? course.lessonsPerWeek : '________'} marta (oydagi darslar soni kalendarga qarab o'zgaradi)\n1 dars = ${course.lessonMinutes ?? '________'} daqiqa`,
    ),
    row('Kurs haqi (oylik)', som(course.monthlyPrice)),
    row('Chegirma', discount),
    row(
      "Dastlabki to'lov",
      `${som(course.firstPaymentAmount)}   |   To'lov sanasi: ${course.firstPaymentDate ? dmy(course.firstPaymentDate) : blankDate(year)}`,
    ),
    row("Keyingi to'lovlar muddati", T.NEXT_PAYMENTS),
    row(
      'Kurs ichiga kiradigan narsa',
      CONTRACT_INCLUDES.map(
        (item) =>
          `${box(course.includes.includes(item))} ${INCLUDE_LABEL[item]}`,
      ).join('   '),
    ),
  ]);
}

function subject(f: ContractFields, year: string): Content[] {
  const many = f.courses.length > 1;
  return [
    heading(T.SECTION_2_TITLE),
    paragraph(T.SECTION_2_INTRO),
    ...f.courses.flatMap((course, i): Content[] => [
      ...(many ? [caption(`${i + 1}-kurs`)] : []),
      courseTable(course, year),
    ]),
    ...T.SECTION_2_TAIL.map(paragraph),
  ];
}

function body(): Content[] {
  return T.BODY_SECTIONS.flatMap((s): Content[] => [
    heading(s.title),
    ...s.items.map(paragraph),
  ]);
}

function requisites(f: ContractFields, contractDate: string): Content[] {
  const c = f.customer;
  const day = dmy(contractDate);
  const executor = [
    ...T.EXECUTOR_LINES,
    "Imzo: ___________________  M.O'.",
    `F.I.O.: ${f.branch.representativeName}`,
    `Sana: ${day}`,
  ];
  const customer = [
    `F.I.O.: ${c.fullName}`,
    `Pasport: ${orLine(c.passport)}`,
    `Manzil: ${orLine(c.address)}`,
    `Tel: ${c.phone ? formatPhone(c.phone) : LINE}`,
    'Imzo: ___________________',
    `Sana: ${day}`,
  ];
  return [
    heading(T.SECTION_11_TITLE),
    grid(
      [
        [
          { text: 'IJROCHI', bold: true },
          { text: 'BUYURTMACHI', bold: true },
        ],
        [{ stack: executor.map(line) }, { stack: customer.map(line) }],
      ],
      ['*', '*'],
    ),
    {
      text: T.LICENSE_LINE.join('   ·   '),
      fontSize: 8,
      color: '#555555',
      margin: [0, 4, 0, 0],
    },
  ];
}

function marketing(year: string): Content[] {
  const choice = '□ roziman    □ rozi emasman';
  return [
    heading(T.MARKETING_TITLE),
    grid([
      ...T.MARKETING_ROWS.map((label) => row(label, choice)),
      row(
        T.MARKETING_SIGN_LABEL,
        `Imzo: ____________________    Sana: ${blankDate(year)}`,
      ),
    ]),
    {
      text: T.MARKETING_NOTE,
      fontSize: 8,
      italics: true,
      margin: [0, 2, 0, 0],
    },
  ];
}

export function contractDocDefinition(
  input: ContractPdfInput,
): TDocumentDefinitions {
  if (input.templateVersion !== CONTRACT_TEMPLATE_VERSION) {
    throw new Error(
      `Shartnoma matnining ${input.templateVersion}-versiyasi yo'q`,
    );
  }
  const f = input.fields;
  const year = input.contractDate.slice(0, 4);
  return {
    info: { title: `Shartnoma ${input.number}`, author: T.COMPANY_NAME },
    pageSize: 'A4',
    // Same margins as the Word file: left 23 mm, right 15.6 mm.
    pageMargins: [23 * MM, 15 * MM, 15.6 * MM, 18 * MM],
    defaultStyle: {
      font: 'Inter',
      fontSize: 9,
      lineHeight: 1.25,
      color: '#111111',
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${input.number} · ${currentPage} / ${pageCount}`,
      alignment: 'right',
      fontSize: 7.5,
      color: '#777777',
      margin: [0, 8, 15.6 * MM, 0],
    }),
    background: input.cancelled
      ? (_page: number, size: { width: number; height: number }) => ({
          text: 'BEKOR QILINGAN',
          color: '#DC2626',
          opacity: 0.12,
          bold: true,
          fontSize: 72,
          absolutePosition: { x: 0, y: size.height / 2 - 50 },
          alignment: 'center',
        })
      : undefined,
    content: [
      { text: T.TITLE, bold: true, fontSize: 12, alignment: 'center' },
      {
        text: `№ ${input.number}`,
        bold: true,
        alignment: 'center',
        margin: [0, 2, 0, 6],
      },
      {
        columns: [
          { text: `${f.branch.city} shahri` },
          { text: headerDate(input.contractDate), alignment: 'right' },
        ],
        margin: [0, 0, 0, 8],
      },
      paragraph(T.PREAMBLE),
      {
        text: noBreakHyphens(T.MINOR_NOTE),
        italics: true,
        fontSize: 8,
        margin: [0, 0, 0, 4],
      },
      ...parties(f),
      ...subject(f, year),
      ...body(),
      ...requisites(f, input.contractDate),
      ...marketing(year),
    ],
  };
}

export function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  return renderPdf(contractDocDefinition(input));
}
