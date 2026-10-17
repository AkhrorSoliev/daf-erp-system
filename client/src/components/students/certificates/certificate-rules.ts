import type { LevelPreview } from "./certificate-types";

/** 'YYYY-MM-DD' → 'dd.MM.yyyy' (a calendar day, no timezone arithmetic). */
export function dmy(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

export function percentText(percent: number | null): string {
  return percent === null ? "—" : `${percent}%`;
}

/**
 * What the button may do. The server decides (and refuses a wrong call);
 * this only hides the button a caller cannot use: `exempt` is the CEO's
 * «Istisno bilan berish», `blocked` shows the reason instead of a button.
 */
export function issueMode(
  level: LevelPreview,
  isCeo: boolean,
): "normal" | "exempt" | "blocked" {
  if (level.verdict.eligible) return "normal";
  return isCeo ? "exempt" : "blocked";
}

export interface SummaryLine {
  label: string;
  value: string;
  hint: string | null;
}

/** The lines of one level's card; a line with nothing to say is left out. */
export function levelSummary(l: LevelPreview): SummaryLine[] {
  const lines: SummaryLine[] = [
    {
      label: "Davomat",
      value: `${percentText(l.attendance.percent)} · ${l.attendance.attended} / ${l.attendance.counted} dars`,
      hint: `chegara ${l.thresholds.attendance}%`,
    },
  ];
  if (l.app.applies) {
    lines.push({
      label: "Ilova",
      value: `${percentText(l.app.percent)} · ${l.app.done} / ${l.app.open} dars`,
      hint: l.thresholds.app === null ? null : `chegara ${l.thresholds.app}%`,
    });
  } else {
    lines.push({ label: "Ilova", value: "shart qo'llanmaydi", hint: null });
  }
  lines.push({ label: "Kech qolgan", value: `${l.attendance.late} marta`, hint: null });
  if (l.unitTests) {
    lines.push({
      label: "Yakuniy sinovlar",
      value: `${l.unitTests.passed} / ${l.unitTests.total}`,
      hint: null,
    });
  }
  if (l.mock) {
    lines.push({
      label: "Mock imtihon",
      value: `${l.mock.score} / ${l.mock.maxScore}${l.mock.date ? ` · ${dmy(l.mock.date)}` : ""}`,
      hint: null,
    });
  }
  return lines;
}
