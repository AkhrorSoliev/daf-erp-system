import { Injectable, Logger } from '@nestjs/common';
import { buildStatement } from './build-statement';
import { presentStatement } from './present-statement';
import { renderStatementPdf } from './statement-pdf';
import { StatementLoader } from './statement.loader';
import type { StatementModel } from './statement.types';

/** 'tolovlar-hisoboti-7-26-09-2026.pdf', or without the id for the student's own copy. */
export function statementFilename(
  model: StatementModel,
  withId: boolean,
): string {
  const d = model.asOf;
  const date = `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
  return withId
    ? `tolovlar-hisoboti-${model.student.id}-${date}.pdf`
    : `tolovlar-hisoboti-${date}.pdf`;
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
