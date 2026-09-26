import { Injectable, Logger } from '@nestjs/common';
import { buildStatement } from './build-statement';
import { presentStatement } from './present-statement';
import { renderStatementPdf } from './statement-pdf';
import { StatementLoader } from './statement.loader';
import type { StatementModel } from './statement.types';

/** Letters and digits only: apostrophes go, spaces become hyphens. */
function fileSafe(text: string): string {
  return text
    .replace(/['`ʻʼ‘’]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * 'Valiyev-A-10001-26-09-2026.pdf': surname, first initial, id and the day,
 * for every copy (admin, portal, bot). A part left empty by `fileSafe` is
 * dropped, so the id and the day always remain.
 */
export function statementFilename(
  model: Pick<StatementModel, 'asOf'> & {
    student: Pick<StatementModel['student'], 'id' | 'firstName' | 'lastName'>;
  },
): string {
  const d = model.asOf;
  const date = `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
  const { id, firstName, lastName } = model.student;
  const initial = fileSafe(firstName).charAt(0).toUpperCase();
  return (
    [fileSafe(lastName), initial, String(id), date].filter(Boolean).join('-') +
    '.pdf'
  );
}

@Injectable()
export class StatementService {
  private readonly logger = new Logger(StatementService.name);

  constructor(private readonly loader: StatementLoader) {}

  async build(studentId: number, companyId: number): Promise<StatementModel> {
    const model = buildStatement(await this.loader.load(studentId, companyId));
    if (model.equation.unexplained !== 0) {
      this.logger.error(
        `Statement for student ${studentId} is off the balance by ${model.equation.unexplained}`,
      );
    }
    return model;
  }

  /** The student's copy: always in the student's voice, whoever downloads it. */
  async pdf(
    studentId: number,
    companyId: number,
  ): Promise<{ buffer: Buffer; model: StatementModel }> {
    const model = await this.build(studentId, companyId);
    const buffer = await renderStatementPdf(presentStatement(model, 'student'));
    return { buffer, model };
  }
}
