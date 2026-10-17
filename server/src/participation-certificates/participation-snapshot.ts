import type { Thresholds } from './participation-rules';
import type {
  CertificateSnapshot,
  LevelFacts,
  StudentFacts,
} from './participation-types';

/** A copy, not a reference: the live facts object may be reused after issuing. */
export function buildSnapshot(
  student: StudentFacts['student'],
  facts: LevelFacts,
  thresholds: Thresholds,
  exempt: boolean,
): CertificateSnapshot {
  return {
    version: 1,
    student: { ...student },
    level: facts.level,
    courseName: facts.courseName,
    groupNames: [...facts.groupNames],
    lessonMinutes: facts.lessonMinutes,
    from: facts.from,
    to: facts.to,
    attendance: { ...facts.attendance },
    app: { ...facts.app },
    unitTests: facts.unitTests ? { ...facts.unitTests } : null,
    mock: facts.mock ? { ...facts.mock } : null,
    thresholds: { ...thresholds },
    exempt,
  };
}
