import type { TaskReportFigures } from '../../tasks/task-report-figures';
import { escapeHtml } from './format.util';

/** «Topshiriqlar: ochiq N, muddati o'tgan M. Eng ko'p kechikkan: <ism> — K»; null when M = 0. */
export function buildTaskLine(f: TaskReportFigures): string | null {
  if (f.overdue === 0) return null;
  const head = `📋 Topshiriqlar: ochiq <b>${f.open}</b>, muddati o'tgan <b>${f.overdue}</b>.`;
  return f.leader
    ? `${head} Eng ko'p kechikkan: ${escapeHtml(f.leader.name)} — <b>${f.leader.overdue}</b>`
    : head;
}
