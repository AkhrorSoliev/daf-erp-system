import QRCode from 'qrcode';
import type {
  Content,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { tashkentDateStr } from '../common/date/tashkent';
import { getCompanyLogoDataUrl, renderPdf } from '../receipts/pdf/render';
import { GER_LEVELS } from './participation-rules';
import type { CertificateSnapshot } from './participation-types';

/**
 * The «Teilnahmebestätigung» page (spec 6, approved sample v8). One A4 page,
 * German text, issued in the name of DaF Sprachzentrum: no branch, no course
 * head, no stamp, no place. Every figure comes from the sealed snapshot.
 *
 * Plain flow, no background layer: a page-sized background block that does not
 * fit inside the page margins is dropped silently by pdfmake.
 */

const C = {
  navy: '#17375E',
  gold: '#B8924A',
  ink: '#101828',
  muted: '#667085',
  line: '#C9CED6',
  head: '#EEF2F7',
};
const MARGIN = 54;
const CONTENT_WIDTH = 595.28 - 2 * MARGIN;
const NO_BORDER: CustomTableLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};
// Layouts are typed constants, not inline objects: an inline function inside
// the big `Content` union gets no contextual parameter types and fails
// `noImplicitAny`.
const FIELDS_LAYOUT: CustomTableLayout = {
  hLineWidth: (i) => (i === 0 ? 0 : 0.5),
  hLineColor: () => C.line,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};
const RESULTS_LAYOUT: CustomTableLayout = {
  hLineWidth: (i, node) =>
    i === 0 || i === 1 || i === node.table.body.length ? 0.9 : 0.5,
  hLineColor: (i, node) =>
    i === 0 || i === 1 || i === node.table.body.length ? C.navy : C.line,
  vLineWidth: () => 0,
  paddingLeft: (i) => (i === 0 ? 6 : 8),
  paddingRight: (i, node) =>
    i === (node.table.widths?.length ?? 1) - 1 ? 6 : 8,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};
const SCALE_LAYOUT: CustomTableLayout = {
  hLineWidth: () => 0.75,
  vLineWidth: () => 0.75,
  hLineColor: () => C.line,
  vLineColor: () => C.line,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

/** 'YYYY-MM-DD' → 'dd.MM.yyyy'. */
function de(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

/** A German decimal: 72.5 → '72,5'. */
function num(n: number): string {
  return String(n).replace('.', ',');
}

export interface OverviewRow {
  area: string;
  result: string;
  note: string;
}

/** The rows of «Teilnahme im Überblick»; a row without data is not drawn. */
export function overviewRows(s: CertificateSnapshot): OverviewRow[] {
  const rows: OverviewRow[] = [
    {
      area: 'Anwesenheit',
      result: `${s.attendance.percent ?? 0} %`,
      note: `${s.attendance.attended} von ${s.attendance.counted} Unterrichtseinheiten`,
    },
    { area: 'Verspätungen', result: String(s.attendance.late), note: '' },
  ];
  if (s.app.applies) {
    rows.push({
      area: 'Lernplattform',
      result: `${s.app.percent ?? 0} %`,
      note: `${s.app.done} von ${s.app.open} Lektionen abgeschlossen`,
    });
  }
  // Information only, and only a result worth showing: none passed, no row.
  if (s.unitTests && s.unitTests.passed > 0) {
    rows.push({
      area: 'Abschlusstests',
      result: `${s.unitTests.passed} von ${s.unitTests.total}`,
      note: 'bestanden',
    });
  }
  if (s.mock) {
    rows.push({
      area: 'Mock-Prüfung',
      result: `${num(s.mock.score)} Punkte`,
      note: `von ${num(s.mock.maxScore)}${s.mock.date ? ` · ${de(s.mock.date)}` : ''}`,
    });
  }
  return rows;
}

/**
 * The confirmation sentence. An exemption (the CEO gave the document although
 * the rule is not met) does not say «regelmäßig»; nothing else marks it.
 */
function confirmationText(s: CertificateSnapshot): Content {
  const tail = [
    ' am Deutschunterricht auf dem Niveau ',
    { text: s.level, bold: true },
    ' des Gemeinsamen europäischen Referenzrahmens für Sprachen (GER) teilgenommen.',
  ];
  return {
    text: s.exempt
      ? ['hat im genannten Zeitraum', ...tail]
      : [
          'hat im genannten Zeitraum ',
          { text: 'regelmäßig', bold: true },
          ...tail,
        ],
    lineHeight: 1.45,
    margin: [0, 14, 0, 18],
  };
}

function fieldRow(label: string, value: string): TableCell[] {
  return [
    { text: label, fontSize: 9.5, color: C.muted, margin: [0, 5, 0, 3] },
    {
      text: value,
      font: 'PlexSerif',
      fontSize: 12,
      bold: true,
      color: C.ink,
      margin: [0, 4, 0, 3],
    },
  ];
}

function resultRow(row: OverviewRow): TableCell[] {
  return [
    { text: row.area, fontSize: 10, margin: [0, 5, 0, 5] },
    {
      text: row.result,
      font: 'PlexSerif',
      fontSize: 11,
      bold: true,
      color: C.navy,
      alignment: 'right',
      margin: [0, 5, 0, 5],
    },
    { text: row.note, fontSize: 9, color: C.muted, margin: [0, 5, 0, 5] },
  ];
}

function headCell(text: string, alignment?: 'right'): TableCell {
  return {
    text,
    fontSize: 9,
    bold: true,
    color: C.muted,
    fillColor: C.head,
    alignment,
    margin: [0, 5, 0, 5],
  };
}

function scale(level: string): Content {
  return {
    table: {
      widths: ['*', '*', '*', '*', '*', '*'],
      body: [
        GER_LEVELS.map(
          (l): TableCell => ({
            text: l,
            alignment: 'center',
            bold: true,
            fontSize: 11,
            color: l === level ? '#FFFFFF' : C.muted,
            fillColor: l === level ? C.navy : undefined,
            margin: [0, 7, 0, 7],
          }),
        ),
      ],
    },
    layout: SCALE_LAYOUT,
  };
}

export interface CertificateDocInput {
  snapshot: CertificateSnapshot;
  number: string;
  issuedAt: Date;
  qrDataUrl: string;
  logoDataUrl: string | null;
}

export function buildCertificateDoc(
  input: CertificateDocInput,
): TDocumentDefinitions {
  const { snapshot: s, number, issuedAt, qrDataUrl, logoDataUrl } = input;
  const issued = de(tashkentDateStr(issuedAt));

  const fields: TableCell[][] = [
    fieldRow('Name, Vorname', `${s.student.lastName}, ${s.student.firstName}`),
  ];
  if (s.student.dateOfBirth) {
    fields.push(fieldRow('Geburtsdatum', de(s.student.dateOfBirth)));
  }
  fields.push(
    fieldRow('Kurs', s.courseName ?? `Deutsch ${s.level}`),
    fieldRow('Zeitraum', `${de(s.from)} – ${de(s.to)}`),
    fieldRow(
      'Unterrichtseinheiten',
      `${s.attendance.counted}${s.lessonMinutes ? ` (à ${s.lessonMinutes} Minuten)` : ''}`,
    ),
  );

  const rows = overviewRows(s);

  return {
    pageSize: 'A4',
    pageMargins: [MARGIN, 38, MARGIN, 26],
    defaultStyle: {
      font: 'PlexSans',
      fontSize: 11,
      color: C.ink,
      lineHeight: 1.25,
    },
    info: { title: `Teilnahmebestätigung ${number}` },
    content: [
      {
        columns: [
          logoDataUrl
            ? { image: logoDataUrl, width: 104, margin: [0, 2, 0, 0] }
            : { text: 'DaF Sprachzentrum', bold: true, fontSize: 12 },
          { width: '*', text: '' },
          {
            width: 'auto',
            stack: [
              {
                text: 'DaF Sprachzentrum',
                fontSize: 11,
                bold: true,
                alignment: 'right',
              },
              {
                text: `Nr. ${number}`,
                fontSize: 9.5,
                bold: true,
                alignment: 'right',
                margin: [0, 6, 0, 0],
              },
              {
                text: 'Echtheit prüfen: QR-Code scannen',
                fontSize: 7.5,
                color: C.muted,
                alignment: 'right',
              },
            ],
          },
          { width: 10, text: '' },
          { width: 58, image: qrDataUrl, margin: [0, 2, 0, 0] },
        ],
      },
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: CONTENT_WIDTH,
            y2: 0,
            lineWidth: 1.2,
            lineColor: C.navy,
          },
        ],
        margin: [0, 14, 0, 0],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              {
                text: 'TEILNAHMEBESTÄTIGUNG',
                font: 'PlexSerif',
                fontSize: 24,
                bold: true,
                color: C.navy,
                characterSpacing: 0.5,
                margin: [0, 20, 0, 2],
              },
              {
                text: `Deutsch als Fremdsprache · Niveau ${s.level}`,
                fontSize: 12,
                color: C.muted,
              },
            ],
          },
          {
            width: 'auto',
            margin: [0, 16, 0, 0],
            table: {
              body: [
                [
                  {
                    stack: [
                      {
                        text: s.level,
                        font: 'PlexSerif',
                        fontSize: 24,
                        bold: true,
                        color: '#FFFFFF',
                        alignment: 'center',
                      },
                      {
                        text: 'NIVEAU',
                        fontSize: 6.5,
                        bold: true,
                        color: '#E3C987',
                        characterSpacing: 2,
                        alignment: 'center',
                        margin: [0, 1, 0, 0],
                      },
                    ],
                    fillColor: C.navy,
                    margin: [11, 7, 11, 7],
                  },
                ],
              ],
            },
            layout: NO_BORDER,
          },
        ],
      },
      {
        table: { widths: [150, '*'], body: fields },
        layout: FIELDS_LAYOUT,
        margin: [0, 26, 0, 0],
      },
      confirmationText(s),
      {
        text: 'Teilnahme im Überblick',
        fontSize: 11,
        bold: true,
        color: C.navy,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: [150, 90, '*'],
          body: [
            [
              headCell('Bereich'),
              headCell('Ergebnis', 'right'),
              headCell('Erläuterung'),
            ],
            ...rows.map(resultRow),
          ],
        },
        layout: RESULTS_LAYOUT,
      },
      {
        text: 'Diese Bestätigung bescheinigt die Teilnahme am Kurs. Sie ist kein Sprachzertifikat und ersetzt keine Prüfung.',
        italics: true,
        color: C.muted,
        fontSize: 8.5,
        margin: [0, 8, 0, 16],
      },
      {
        text: 'Niveaustufen des Gemeinsamen europäischen Referenzrahmens für Sprachen (GER)',
        fontSize: 8.5,
        color: C.muted,
        margin: [0, 0, 0, 5],
      },
      scale(s.level),
      {
        text: [
          { text: 'Ausgestellt am ', color: C.muted },
          { text: issued, bold: true },
        ],
        fontSize: 10,
        margin: [0, 28, 0, 0],
      },
    ],
  };
}

export interface CertificatePdfInput {
  snapshot: CertificateSnapshot;
  number: string;
  issuedAt: Date;
  /** What the QR code opens: the public `/t/<uuid>` page. */
  url: string;
}

export async function renderCertificatePdf(
  input: CertificatePdfInput,
): Promise<Buffer> {
  const qrDataUrl = await QRCode.toDataURL(input.url, {
    margin: 0,
    errorCorrectionLevel: 'M',
    width: 300,
    color: { dark: C.navy, light: '#FFFFFF' },
  });
  return renderPdf(
    buildCertificateDoc({
      snapshot: input.snapshot,
      number: input.number,
      issuedAt: input.issuedAt,
      qrDataUrl,
      logoDataUrl: getCompanyLogoDataUrl(),
    }),
  );
}
