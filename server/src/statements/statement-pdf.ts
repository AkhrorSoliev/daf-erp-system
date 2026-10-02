import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { renderPdf } from '../receipts/pdf/render';
import type { DueView, Segment, StatementView } from './present-statement';

const C = {
  blue: '#1F4E78',
  grey: '#666666',
  line: '#DADDE2',
  highlight: '#FFF3B0',
  green: '#1B7F3B',
  red: '#B42318',
  greenBg: '#E8F5EC',
  redBg: '#FDECEA',
};
const TONE = { red: C.red, green: C.green, muted: C.grey } as const;

const rich = (segments: Segment[]) =>
  segments.map((s) => ({
    text: s.text,
    bold: s.bold ?? false,
    ...(s.tone ? { color: TONE[s.tone] } : {}),
  }));

const section = (title: string): Content => ({
  text: title,
  bold: true,
  fontSize: 11.5,
  color: C.blue,
  margin: [0, 9, 0, 4],
});

const head = (text: string, right = true): TableCell => ({
  text,
  bold: true,
  ...(right ? { alignment: 'right' as const } : {}),
});

function answerBox(answer: StatementView['answer']): Content {
  const debt = answer.tone === 'debt';
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              {
                text: answer.title,
                bold: true,
                fontSize: 15,
                color: debt ? C.red : C.green,
              },
              { text: answer.subtitle, fontSize: 10, margin: [0, 2, 0, 0] },
            ],
            fillColor: debt ? C.redBg : C.greenBg,
            margin: [8, 6, 8, 6],
          },
        ],
      ],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 6],
  };
}

/** What the student paid, oldest first, and which lessons each payment went to. */
function paymentsTable(
  rows: StatementView['payments'],
  total: StatementView['paidTotal'],
): Content {
  if (rows.length === 0) return { text: "Hali to'lov qilinmagan." };
  const body: TableCell[][] = [
    [
      head('Sana', false),
      head('Usul', false),
      head('Summa'),
      head('Qaysi oyga yozildi', false),
    ],
    ...rows.map((r): TableCell[] => [
      { text: r.date },
      { text: r.what },
      { text: r.amount, bold: true, alignment: 'right' },
      { text: r.to },
    ]),
  ];
  if (total) {
    body.push([
      { text: "Jami to'langan", bold: true, colSpan: 2 },
      '',
      { text: total, bold: true, alignment: 'right' },
      '',
    ]);
  }
  const rule = total ? body.length - 1 : -1;
  return {
    table: { headerRows: 1, widths: [58, 70, 62, '*'], body },
    layout: {
      hLineWidth: (i) =>
        i === 1 || i === rule ? 0.8 : i > 1 && i < body.length ? 0.3 : 0,
      hLineColor: (i) => (i === 1 || i === rule ? C.blue : C.line),
      vLineWidth: () => 0,
      paddingTop: () => 2.5,
      paddingBottom: () => 2.5,
    },
  };
}

function dueRow(d: DueView): TableCell[] {
  const fillColor = d.highlight ? C.highlight : undefined;
  const label: TableCell = { text: d.label, bold: d.bold, fillColor };
  const lessons: TableCell = {
    text: [
      { text: d.lessons },
      ...(d.lessonsNote
        ? [{ text: ` · ${d.lessonsNote}`, color: C.grey, fontSize: 8 }]
        : []),
    ],
    fillColor,
  };
  return [
    ...(d.wide ? [{ ...label, colSpan: 2 }, ''] : [label, lessons]),
    d.cost !== null
      ? { text: d.cost, alignment: 'right', fillColor }
      : {
          text: d.costNote ?? '',
          color: C.grey,
          fontSize: 8,
          alignment: 'right',
          fillColor,
        },
    { text: d.paid, alignment: 'right', fillColor },
    {
      text: d.left,
      alignment: 'right',
      color: TONE[d.leftTone],
      fillColor,
    },
  ];
}

const detailRow = (line: string, fillColor?: string): TableCell[] => [
  { text: '', fillColor },
  { text: line, colSpan: 4, color: C.grey, fontSize: 8, fillColor },
  '',
  '',
  '',
];

/** Each month: its price, what the payments covered of it, what is still owed. */
function duesTable(view: StatementView): Content {
  const body: TableCell[][] = [
    [
      head('Oy', false),
      head('Darslar', false),
      head('Narxi'),
      head("To'langan"),
      head('Qarz'),
    ],
  ];
  const thin = new Set<number>();
  const thick = new Set<number>([1]);
  for (const d of view.dues) {
    body.push(dueRow(d));
    for (const line of d.details) {
      body.push(detailRow(line, d.highlight ? C.highlight : undefined));
    }
    thin.add(body.length);
  }
  const total = view.duesTotal;
  if (total) {
    thick.add(body.length);
    body.push([
      { text: 'Jami', bold: true, colSpan: 2 },
      '',
      { text: total.cost, bold: true, alignment: 'right' },
      { text: total.paid, bold: true, alignment: 'right' },
      {
        text: total.left,
        bold: true,
        alignment: 'right',
        color: TONE[total.leftTone],
      },
    ]);
    for (const line of total.details) body.push(detailRow(line));
  }
  if (view.surplus) {
    thin.add(body.length);
    body.push([
      { text: view.surplus.label, bold: true, colSpan: 4 },
      '',
      '',
      '',
      {
        text: view.surplus.amount,
        bold: true,
        alignment: 'right',
        color: C.green,
      },
    ]);
  }
  return {
    table: { headerRows: 1, widths: [56, 140, 90, 90, '*'], body },
    layout: {
      hLineWidth: (i) => (thick.has(i) ? 0.8 : thin.has(i) ? 0.3 : 0),
      hLineColor: (i) => (thick.has(i) ? C.blue : C.line),
      vLineWidth: () => 0,
      paddingTop: () => 2.5,
      paddingBottom: () => 2.5,
    },
  };
}

export function statementDocDefinition(
  view: StatementView,
): TDocumentDefinitions {
  const content: Content[] = [
    { text: view.title, bold: true, fontSize: 16, margin: [0, 0, 0, 2] },
    { text: view.studentLine },
    { text: view.asOfLine, color: C.grey, fontSize: 9, margin: [0, 0, 0, 8] },
    answerBox(view.answer),
    {
      text: rich(view.equation),
      alignment: 'center',
      fontSize: 10.3,
      margin: [0, 2, 0, 2],
    },
    section("To'lovlar"),
    paymentsTable(view.payments, view.paidTotal),
    section("Oylar bo'yicha"),
    duesTable(view),
  ];
  if (view.sharpNote) {
    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: rich(view.sharpNote),
              fillColor: C.highlight,
              fontSize: 9,
              margin: [5, 3, 5, 3],
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 3, 0, 0],
    });
  }
  content.push({
    unbreakable: true,
    stack: [
      section('Izohlar'),
      { ul: view.notes, fontSize: 8.6, color: '#444444' },
    ],
  });

  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 36],
    info: { title: "To'lovlar hisoboti", author: 'DaF Sprachzentrum' },
    defaultStyle: { font: 'Inter', fontSize: 9.5, lineHeight: 1.15 },
    content,
  };
}

export function renderStatementPdf(view: StatementView): Promise<Buffer> {
  return renderPdf(statementDocDefinition(view));
}
