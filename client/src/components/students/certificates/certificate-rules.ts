import { tashkentNow } from "@/lib/tashkent-time";
import type { LevelPreview } from "./certificate-types";

/** 'YYYY-MM-DD' → 'dd.MM.yyyy' (a calendar day, no timezone arithmetic). */
export function dmy(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

/** An issue instant as the TASHKENT day, 'dd.MM.yyyy': the day the PDF and the QR page print (the UTC day is wrong 00:00-05:00). */
export function issuedDay(issuedAt: string): string {
  return dmy(tashkentNow(new Date(issuedAt)).dateStr);
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

/** The owner's words (17.10.2026), one place: the dialog, the exemption notice and their test read these. */
export const REISSUE_CONFIRM_TEXT =
  "Bu daraja uchun hujjat allaqachon berilgan. Yangi raqamli yana bittasini berasizmi?";
export const REISSUE_EXEMPT_NOTICE =
  "Bu daraja uchun hujjat allaqachon berilgan. Yangisiga yangi raqam beriladi.";

/** A level that already has a document asks before another one (with a new number) is issued. */
export function needsReissueConfirm(level: Pick<LevelPreview, "issued">): boolean {
  return level.issued.length > 0;
}

/**
 * What a click on the issue button does. The exemption keeps its own reason
 * dialog (it only adds a notice, no extra step); a normal issue is immediate
 * unless the level already has a document.
 */
export function issueClickAction(
  level: Pick<LevelPreview, "issued">,
  mode: "normal" | "exempt",
): "issue" | "confirm" | "exempt" {
  if (mode === "exempt") return "exempt";
  return needsReissueConfirm(level) ? "confirm" : "issue";
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
