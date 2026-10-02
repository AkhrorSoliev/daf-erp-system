import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { renderPdf } from '../receipts/pdf/render';
import type { MonthView, Segment, StatementView } from './present-statement';

/** The colours of the layout the CEO approved (v3 mockups, 26.09.2026). */
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

const head = (text: string, right = true): TableCell => ({
  text,
  bold: true,
  ...(right ? { alignment: 'right' as const } : {}),
});

function monthsTable(
  months: MonthView[],
  total: StatementView['monthsTotal'],
): Content {
  const body: TableCell[][] = [
    [
      head('Oy', false),
      head('Darslar'),
      head('Darslar narxi'),
      head("To'langan"),
      head('Qarz'),
    ],
  ];
  const lineAfter = new Set<number>();
  for (const m of months) {
    const fillColor = m.highlight ? C.highlight : undefined;
    body.push([
      { text: m.label, bold: m.isLast, fillColor },
      {
        text: [
          { text: m.lessons },
          ...(m.absent
            ? [{ text: ` · ${m.absent}`, color: C.grey, fontSize: 8 }]
            : []),
        ],
        alignment: 'right',
        fillColor,
      },
      m.cost !== null
        ? { text: m.cost, alignment: 'right', fillColor }
        : {
            text: m.costNote ?? '',
            color: C.grey,
            fontSize: 8,
            alignment: 'right',
            fillColor,
          },
      { text: m.covered, alignment: 'right', fillColor },
      {
        text: m.left,
        alignment: 'right',
        color: TONE[m.leftTone],
        fillColor,
      },
    ]);
    for (const line of m.details) {
      body.push([
        { text: '', fillColor },
        { text: line, colSpan: 4, color: C.grey, fontSize: 8, fillColor },
        '',
        '',
        '',
      ]);
    }
    lineAfter.add(body.length - 1);
  }
  if (total) {
    body.push([
      { text: 'Jami', bold: true },
      '',
      { text: total.cost, bold: true, alignment: 'right' },
      { text: total.covered, bold: true, alignment: 'right' },
      {
        text: total.left,
        bold: true,
        alignment: 'right',
        color: TONE[total.leftTone],
      },
    ]);
  }
  const totalLine = total ? body.length - 1 : -1;
  return {
    table: { headerRows: 1, widths: [60, 92, 112, 100, '*'], body },
    layout: {
      hLineWidth: (i) =>
        i === 1 || i === totalLine ? 0.8 : lineAfter.has(i - 1) ? 0.3 : 0,
      hLineColor: (i) => (i === 1 || i === totalLine ? C.blue : C.line),
      vLineWidth: () => 0,
      paddingTop: () => 2.5,
      paddingBottom: () => 2.5,
    },
  };
}

function paymentsTable(
  rows: StatementView['allocations'],
  total: StatementView['paidTotal'],
): Content {
  if (rows.length === 0) return { text: "Hali to'lov qilinmagan." };
  const body: TableCell[][] = [
    [
      head('Sana', false),
      head('Usul', false),
      head('Summa'),
      head('Qaysi darslarga yozildi', false),
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
    paymentsTable(view.allocations, view.paidTotal),
    section("Oylar bo'yicha"),
  ];
  if (view.packHint) {
    content.push({
      text: view.packHint,
      color: C.grey,
      fontSize: 8.3,
      margin: [0, 0, 0, 3],
    });
  }
  content.push(monthsTable(view.months, view.monthsTotal));
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
  for (const change of view.modelChanges) {
    content.push(section(change.title), { ul: change.lines, fontSize: 9.4 });
  }
  content.push({
    text: view.footnote,
    color: C.grey,
    fontSize: 8.3,
    margin: [0, 8, 0, 0],
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
