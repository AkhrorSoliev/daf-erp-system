import { formatBalance } from "@/lib/format-utils";
import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";
import { tashkentNow } from "@/lib/tashkent-time";
import type { IssuedCertificate, LevelPreview } from "./certificate-types";

/** `t` of a page with a language; the default says the Uzbek text. */
type Translate = (source: string, params?: Params) => string;

const SAY_UZBEK: Translate = interpolate;

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
export const REISSUE_CONFIRM_TEXT = msg(
  "Bu daraja uchun hujjat allaqachon berilgan. Yangi raqamli yana bittasini berasizmi?",
);
export const REISSUE_EXEMPT_NOTICE = msg(
  "Bu daraja uchun hujjat allaqachon berilgan. Yangisiga yangi raqam beriladi.",
);

/**
 * A level that already has a STANDING document asks before another one (with a
 * new number) is issued. A cancelled document no longer stands, so re-issuing
 * after a mistake is an ordinary issue.
 */
export function needsReissueConfirm(level: Pick<LevelPreview, "issued">): boolean {
  return level.issued.some((d) => !d.revoked);
}

export const REVOKE_REASON_MIN = 3;
export const REVOKE_REASON_MAX = 500;

/** The server's rule for the cancel reason: 3 to 500 characters after trimming. */
export function validRevokeReason(text: string): boolean {
  const n = text.trim().length;
  return n >= REVOKE_REASON_MIN && n <= REVOKE_REASON_MAX;
}

/** The confirm button: a valid reason, and not while the request is running. */
export function canSubmitRevoke(reason: string, busy: boolean): boolean {
  return !busy && validRevokeReason(reason);
}

/** A short hint only once something is typed and it is still too short. */
export function revokeReasonHint(text: string, t: Translate = SAY_UZBEK): string | null {
  const n = text.trim().length;
  return n > 0 && n < REVOKE_REASON_MIN ? t("Sabab kamida 3 belgidan iborat bo'lsin") : null;
}

/**
 * The owner's words (17.10.2026) for the cancel confirmation. «bekor qilingan»
 * is what the public QR page prints (it is Uzbek only), so every translation
 * keeps those two words as they are.
 */
export function revokeDescription(number: string, t: Translate = SAY_UZBEK): string {
  return t(
    "{number} raqamli hujjat bekor qilinadi. QR sahifa «bekor qilingan» deb ko'rsatadi, PDF endi berilmaydi, raqam qayta berilmaydi. Buni qaytarib bo'lmaydi.",
    { number },
  );
}

export const REVOKED_PILL = msg("Bekor qilingan");

export interface RevokedState {
  pill: string;
  /** Tashkent day of the cancel, 'dd.MM.yyyy'. */
  day: string | null;
  reasonLine: string | null;
}

/** What a cancelled row shows; null for a document that stands. */
export function revokedState(row: IssuedCertificate, t: Translate = SAY_UZBEK): RevokedState | null {
  if (!row.revoked) return null;
  const reason = row.revokedReason?.trim();
  return {
    pill: t(REVOKED_PILL),
    day: row.revokedAt ? issuedDay(row.revokedAt) : null,
    // The reason is what staff typed: data, passed in as a value.
    reasonLine: reason ? t("Sabab: {reason}", { reason }) : null,
  };
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

/**
 * The lines of one level's card; a line with nothing to say is left out.
 * Every figure and limit is the server's: `balance` is the student's balance now,
 * `verdict.latePercent` the server's own rounding. Nothing is computed here.
 */
export function levelSummary(l: LevelPreview, balance: number, t: Translate = SAY_UZBEK): SummaryLine[] {
  const limit = (percent: number) => t("chegara {n}%", { n: percent });
  const lines: SummaryLine[] = [
    {
      label: t("Davomat"),
      value: t("{percent} · {done} / {total} dars", {
        percent: percentText(l.attendance.percent),
        done: l.attendance.attended,
        total: l.attendance.counted,
      }),
      hint: limit(l.thresholds.attendance),
    },
  ];
  lines.push({
    label: t("Darslar soni"),
    value: t("{n} ta", { n: l.attendance.counted }),
    hint: t("kamida {n} ta", { n: l.thresholds.minLessons }),
  });
  lines.push({
    label: t("Kech qolgan"),
    value: t("{late} / {attended} dars ({percent})", {
      late: l.attendance.late,
      attended: l.attendance.attended,
      percent: percentText(l.verdict.latePercent),
    }),
    hint: limit(l.thresholds.maxLatePercent),
  });
  if (l.app.applies) {
    lines.push({
      label: t("Ilova"),
      value: t("{percent} · {done} / {total} dars", {
        percent: percentText(l.app.percent),
        done: l.app.done,
        total: l.app.open,
      }),
      hint: l.thresholds.app === null ? null : limit(l.thresholds.app),
    });
  } else {
    lines.push({ label: t("Ilova"), value: t("shart qo'llanmaydi"), hint: null });
  }
  if (l.unitTests) {
    lines.push({
      label: t("Yakuniy sinovlar"),
      value: `${l.unitTests.passed} / ${l.unitTests.total}`,
      hint: t("hammasi kerak"),
    });
  }
  lines.push({
    label: t("Qarz"),
    value: balance < 0 ? formatBalance(-balance, t("so'm")) : t("yo'q"),
    hint: null,
  });
  if (l.mock) {
    lines.push({
      label: t("Mock imtihon"),
      value: `${l.mock.score} / ${l.mock.maxScore}${l.mock.date ? ` · ${dmy(l.mock.date)}` : ""}`,
      hint: null,
    });
  }
  return lines;
}
