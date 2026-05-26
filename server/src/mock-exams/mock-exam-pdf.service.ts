import { Injectable, Logger } from '@nestjs/common';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import {
  renderPdf,
  getCompanyLogoDataUrl,
} from '../receipts/pdf/render';

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * Generates and stores the anonymous results PDF for a mock exam.
 *
 * The PDF is intentionally name-free: every participant is identified by
 * their `publicId` (5-digit number they were given at registration). The
 * rows are sorted DESC by total score so the highest scorers appear first.
 *
 * Output is uploaded to R2 and the URL stamped onto
 * `MockExam.resultsPdfFileKey` (the field name is a holdover — it actually
 * stores the full public URL).
 */
@Injectable()
export class MockExamPdfService {
  private readonly logger = new Logger(MockExamPdfService.name);

  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  /**
   * Generates a fresh PDF for `examId`, uploads it, and stamps the URL +
   * timestamp on the exam. Replaces any previously-generated PDF (the
   * old R2 key is left in place; cleanup is a future concern).
   */
  async generate(examId: string): Promise<{ url: string }> {
    const exam = await this.prisma.mockExam.findFirst({
      where: { id: examId, deletedAt: null },
      include: {
        section: { select: { name: true } },
        subjects: { orderBy: { order: 'asc' } },
      },
    });
    if (!exam) {
      throw new Error(`MockExam ${examId} not found`);
    }

    const participants = await this.prisma.mockExamParticipant.findMany({
      where: { examId, deletedAt: null },
      orderBy: [
        // DESC by total score; nulls last so ungraded participants sink
        // to the bottom of the list.
        { totalScore: { sort: 'desc', nulls: 'last' } },
        { publicId: 'asc' },
      ],
      select: {
        publicId: true,
        totalScore: true,
        percentage: true,
        rank: true,
        subjectScores: {
          select: { subjectId: true, score: true },
        },
      },
    });

    const doc = this.buildDoc(exam, participants);
    const buffer = await renderPdf(doc);

    const url = await this.uploadService.uploadBuffer(
      buffer,
      'mock-exam-results',
      '.pdf',
      'application/pdf',
    );

    await this.prisma.mockExam.update({
      where: { id: examId },
      data: {
        resultsPdfFileKey: url,
        resultsPdfGeneratedAt: new Date(),
      },
    });

    this.logger.log(
      `Generated results PDF for exam ${examId}: ${participants.length} rows`,
    );

    return { url };
  }

  private buildDoc(
    exam: {
      title: string;
      examDate: Date | null;
      maxScore: number;
      announcedAt: Date | null;
      section: { name: string };
      subjects: Array<{
        id: string;
        name: string;
        maxScore: number;
        passingScore: number | null;
      }>;
    },
    participants: Array<{
      publicId: number;
      totalScore: number | null;
      percentage: number | null;
      rank: number | null;
      subjectScores: Array<{ subjectId: string; score: number }>;
    }>,
  ): TDocumentDefinitions {
    const logo = getCompanyLogoDataUrl();
    const announcedDate = exam.announcedAt ?? new Date();
    const PASS_FILL = '#d1fae5'; // emerald-100
    const FAIL_FILL = '#fee2e2'; // red-100

    // Table header — name only, no /maxScore. Per-subject Total/% columns
    // are intentionally absent (admin/operator wanted a clean per-section
    // view; readers compare each cell against the section's own bar).
    const head: any[] = [
      { text: "O'rin", style: 'th' },
      { text: 'ID', style: 'th' },
      ...exam.subjects.map((s) => ({
        text: s.name,
        style: 'th',
        alignment: 'center',
      })),
    ];

    // Table body. Cells are colored per the subject's own passingScore:
    // pass → green fill, fail → red fill. Empty scores stay neutral.
    const body: any[][] = [head];

    participants.forEach((p) => {
      const scoreBySubject = new Map(
        p.subjectScores.map((s) => [s.subjectId, s.score]),
      );
      const row: any[] = [
        { text: p.rank !== null ? String(p.rank) : '—', alignment: 'center' },
        {
          text: `#${p.publicId}`,
          alignment: 'left',
          style: 'idCell',
        },
        ...exam.subjects.map((subject) => {
          const score = scoreBySubject.get(subject.id);
          const cell: any = {
            text: score !== undefined ? String(score) : '—',
            alignment: 'center',
            style: 'scoreCell',
          };
          if (
            score !== undefined &&
            subject.passingScore !== null &&
            subject.passingScore !== undefined
          ) {
            cell.fillColor =
              score >= subject.passingScore ? PASS_FILL : FAIL_FILL;
          }
          return cell;
        }),
      ];
      body.push(row);
    });

    return {
      pageSize: 'A4',
      pageMargins: [30, 30, 30, 40],
      defaultStyle: { font: 'Inter', fontSize: 9 },
      content: [
        // Header
        {
          columns: [
            logo
              ? { image: logo, width: 60 }
              : { text: 'DaF Sprachzentrum', bold: true, fontSize: 14 },
            {
              stack: [
                {
                  text: exam.title,
                  fontSize: 14,
                  bold: true,
                  alignment: 'right',
                },
                {
                  text: exam.section.name,
                  fontSize: 10,
                  color: '#64748b',
                  alignment: 'right',
                },
              ],
            },
          ],
          margin: [0, 0, 0, 12],
        },
        {
          stack: [
            {
              text: exam.examDate
                ? `Imtihon sanasi: ${formatDate(exam.examDate)}`
                : '',
              fontSize: 9,
              color: '#64748b',
            },
            {
              text: `E'lon qilingan: ${formatDate(announcedDate)}`,
              fontSize: 9,
              color: '#64748b',
            },
          ],
          margin: [0, 0, 0, 12],
        },
        // Anonymity note
        {
          text:
            "📋 Quyidagi jadvalda ishtirokchilar identifikatorlari bo'yicha ko'rsatilgan. " +
            'Ro\'yxatga olishda sizga berilgan raqamni toping va o\'zingizning ' +
            'ballaringizni ko\'ring.',
          fontSize: 8,
          color: '#475569',
          italics: true,
          margin: [0, 0, 0, 12],
        },
        // Results table
        {
          table: {
            headerRows: 1,
            widths: this.computeColumnWidths(exam.subjects.length),
            body,
          },
          // Per-cell fillColor (pass/fail) takes precedence; the layout
          // callback only paints the header row + neutral background for
          // rows that have no explicit fill.
          layout: {
            fillColor: (rowIndex: number, _node: unknown, columnIndex: number) => {
              if (rowIndex === 0) return '#f1f5f9';
              // Only paint zebra fill on the fixed left columns (Rank, ID)
              // so we don't overwrite per-cell green/red on subject columns.
              if (columnIndex < 2) {
                return rowIndex % 2 === 0 ? '#f8fafc' : null;
              }
              return null;
            },
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            hLineColor: () => '#e2e8f0',
          },
        },
      ],
      styles: {
        th: { bold: true, fontSize: 9, color: '#1e293b' },
        idCell: { font: 'Inter', bold: true },
        scoreCell: { fontSize: 9 },
      },
    };
  }

  private computeColumnWidths(subjectCount: number): (number | string)[] {
    // Fixed first 2 columns (Rank, ID) + N flexible subject columns.
    const subjectCols = Array(subjectCount).fill('*');
    return [40, 60, ...subjectCols];
  }
}
