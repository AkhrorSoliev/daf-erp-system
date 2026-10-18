import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import de from "./dictionaries/de";
import en from "./dictionaries/en";
import ru from "./dictionaries/ru";
import uzCyrl from "./dictionaries/uz-cyrl";
import { scanI18nCalls } from "./scan-literals";

const SRC = path.join(__dirname, "..");

/**
 * Files whose every `t("…")` / `msg("…")` text must exist in the ru, de and en
 * dictionaries. A task that translates a file adds it here; the pages are added
 * as they are translated (spec 2026-10-17-tillar §9).
 */
export const STRICT_FILES: string[] = [
  "lib/nav-items.ts",
  "lib/payments-nav.ts",
  "lib/reports-nav.ts",
  "lib/daf-nav.ts",
  "components/app-sidebar.tsx",
  "components/sidebar-footer-info.tsx",
  "components/qollanma/qollanma-yangilik-belgisi.tsx",
  "lib/breadcrumb-routes.ts",
  "components/app-breadcrumb.tsx",
  "components/payments/payments-mobile-menu.tsx",
  "components/reports/reports-mobile-menu.tsx",
  "components/dashboard-header.tsx",
  "components/branch-switcher.tsx",
  "components/global-search/search-dropdown.tsx",
  "components/tasks/header-task-button.tsx",
  "components/qollanma/qollanma-yordam-tugmasi.tsx",
  "components/tashkent-clock.tsx",
  "components/header-user-menu.tsx",
  "lib/ui-skins.ts",
  "components/global-search/search-dropdown-utils.ts",
  "components/global-search/search-dropdown-empty-state.tsx",
  "components/global-search/search-dropdown-results.tsx",
  "components/ui/sidebar.tsx",
  "components/notifications/notification-bell.tsx",
  "components/notifications/notification-row.tsx",
  "components/notifications/notification-actions.ts",
  "components/notifications/push-permission-prompt.tsx",
  "components/notifications/notification-view.ts",
  "lib/portal.ts",
  "components/auth/language-menu.tsx",
  "components/auth/sign-in-heading.tsx",
  "components/language-radio-group.tsx",
  "app/(auth)/login/login-form.tsx",
  "app/(auth)/login/login-footer.tsx",
  "components/auth/staff-greeting.tsx",
  "components/auth/telegram-login-button.tsx",
  "components/theme-toggle.tsx",
  "components/auth/forgot-password-dialog.tsx",
  "components/auth/forgot-password-fields.tsx",
  "components/dashboard/home-overview.tsx",
  "components/dashboard/home-money-cards.tsx",
  "components/dashboard/home-people-stats.tsx",
  "components/dashboard/home-lead-funnel-strip.tsx",
  "components/dashboard/home-attention-list.tsx",
  "components/dashboard/dashboard-home-visibility.ts",
  "components/dashboard/home-next-lessons.tsx",
  "components/dashboard/home-error-note.tsx",
  "components/dashboard/home-load-error.tsx",
  "components/dashboard/home-charts.tsx",
  "components/dashboard/chart-attendance.tsx",
  "components/dashboard/chart-money-trend.tsx",
  "components/dashboard/chart-profit-breakdown.tsx",
  "components/dashboard/chart-student-flow.tsx",
  "components/dashboard/chart-breakdown-rows.ts",
  "components/dashboard/chart-months.ts",
  "components/dashboard/launch/branch-launch-card.tsx",
  "components/dashboard/launch/launch-stations.ts",
  "components/dashboard/schedule-client.tsx",
  "components/dashboard/dashboard-daily-schedule.tsx",
  "components/dashboard/dashboard-room-occupancy.tsx",
  "components/attendance/unmarked/unmarked-lesson-prompt.tsx",
  "components/attendance/unmarked/late-attendance-dialog.tsx",
  "components/attendance/unmarked/not-held-dialog.tsx",
  "components/groups/attendance/attendance-student-row.tsx",
  "components/groups/attendance/attendance-form-utils.ts",
  "components/groups/attendance/attendance-admission.ts",
  "components/groups/attendance/attendance-cycle-utils.ts",
  "components/groups/attendance/attendance-tab.tsx",
  "components/groups/attendance/attendance-form.tsx",
  "components/groups/attendance/attendance-today-card.tsx",
  "components/groups/attendance/attendance-no-lesson-today-card.tsx",
  "components/groups/attendance/attendance-missed-lessons.tsx",
  "components/groups/attendance/attendance-month-calendar.tsx",
  "components/groups/attendance/attendance-dots-tab.tsx",
  "components/groups/attendance/attendance-stats.tsx",
  "components/groups/attendance/attendance-cycle-dashboard.tsx",
  "components/groups/attendance/attendance-debtors-section.tsx",
  "components/groups/attendance/qr-attendance-dialog.tsx",
  "components/shared/attendance-dot.tsx",
  "lib/late-minutes.ts",
  "components/ui/date-picker.tsx",
  "components/shared/chart-card.tsx",
  "components/reports/lead-funnel/lead-funnel-chart.tsx",
  "components/reports/lead-funnel/lead-funnel-math.ts",
  "components/students/students-client.tsx",
  "components/students/students-filters.tsx",
  "components/students/students-stats.tsx",
  "components/students/students-table.tsx",
  "components/students/student-row-actions.tsx",
  "components/students/student-status-badge.tsx",
  "components/students/student-contact-badges.tsx",
  "components/students/student-phone-rows.ts",
  "lib/status-config.ts",
  "lib/telegram-link.ts",
  "components/students/add-student-dialog.tsx",
  "components/students/edit-student-form.tsx",
  "components/students/edit-student-drawer.tsx",
  "components/students/edit-student-additional-fields.tsx",
  "lib/schemas/student-schema.ts",
  "components/leads/lead-source-picker.tsx",
  "components/students/student-profile-client.tsx",
  "components/students/student-profile-card.tsx",
  "components/students/student-profile-tabs.tsx",
  "components/students/student-profile-tabs-utils.ts",
  "components/students/student-group-card.tsx",
  "components/students/student-debt-origin.tsx",
  "components/students/student-lead-tab.tsx",
  "components/students/student-call-history-tab.tsx",
  "components/students/student-mock-exams-tab.tsx",
  "lib/weekdays.ts",
  "hooks/use-leads-board.ts",
  "components/students/enroll-to-group-dialog.tsx",
  "components/students/enroll-preview-block.tsx",
  "components/students/student-remove-from-group-dialog.tsx",
  "components/students/departure-money-block.tsx",
  "components/students/departure-money.ts",
  "components/students/student-closed-enrollments-section.tsx",
  "components/students/write-off-debt-dialog.tsx",
  "components/students/debt-write-off-types.ts",
  "components/payments/salary-utils.ts",
  "components/students/correct-payment-dialog.tsx",
  "components/students/initial-balance-dialog.tsx",
  "components/ui/multi-select-combobox.tsx",
  "components/ui/time-picker.tsx",
  "components/shared/status-history-dialog.tsx",
  "components/shared/in-other-branch.tsx",
  "components/outreach/table-pagination.tsx",
  "components/payments/debt/debt-months-badge.tsx",
  "components/groups/app-activity/student-activity-panel.tsx",
  "components/groups/app-activity/student-activity-sections.tsx",
  "components/groups/app-activity/student-activity-sheet.tsx",
  "components/groups/app-activity/activity-ui.tsx",
  "components/groups/app-activity/activity-format.ts",
  "components/groups/app-activity/group-app-activity-tab.tsx",
  "components/groups/app-activity/group-activity-table.tsx",
  "components/groups/app-activity/activity-explainer.tsx",
  "components/groups/app-activity/difficult-items.tsx",
  "lib/daf-format-nomlari.ts",
  "components/shared/change-status-dialog.tsx",
  "components/shared/change-status-cards.ts",
  "components/shared/translated-status-badge.tsx",
  "lib/freeze-refund-preview.ts",
  "components/ui/price-input.tsx",
  "components/students/lesson-trail-tab.tsx",
  "components/students/lesson-trail-labels.ts",
  "components/students/sms-tab.tsx",
  "components/students/sms-error-text.ts",
  "components/students/statement/payment-statement.tsx",
  "components/students/statement/statement-summary.tsx",
  "components/students/statement/statement-payments.tsx",
  "components/students/statement/statement-months-table.tsx",
  "components/students/statement/statement-ledger.tsx",
  "components/students/statement/statement-report.tsx",
  "components/students/statement/receipt-link.tsx",
  "components/students/statement/statement-utils.ts",
  "lib/ledger-reversal.ts",
  "components/students/certificates/certificate-rules.ts",
  "components/students/certificates/issued-documents-list.tsx",
  "components/students/certificates/revoke-certificate-dialog.tsx",
  "components/students/certificates/student-certificates-tab.tsx",
  "components/students/contracts/contract-rules.ts",
  "components/students/contracts/contract-card.tsx",
  "components/students/contracts/contract-cancel-dialog.tsx",
  "components/students/contracts/contract-course-extras.tsx",
  "components/students/contracts/contract-courses-picker.tsx",
  "components/students/contracts/contract-create-form.tsx",
  "components/students/contracts/contract-customer-fields.tsx",
  "components/students/contracts/contract-edit-form.tsx",
  "components/students/contracts/contract-form-dialog.tsx",
  "components/students/contracts/profile-conflict-note.tsx",
  "components/students/contracts/student-contracts-tab.tsx",
  "components/groups/groups-client.tsx",
  "components/groups/groups-table.tsx",
  "components/groups/groups-cards.tsx",
  "components/groups/groups-stats.tsx",
  "components/groups/groups-heading.tsx",
  "components/groups/group-row-actions.tsx",
  "components/groups/group-delete-dialog.tsx",
  "components/groups/group-delete-copy.ts",
  "components/groups/covering-badge.tsx",
  "components/groups/edit-group-form.tsx",
  "components/groups/edit-group-drawer.tsx",
  "components/groups/group-course-select.tsx",
  "components/groups/group-level-select.tsx",
  "components/groups/group-teacher-select.tsx",
  "components/groups/group-room-select.tsx",
  "components/groups/group-days-picker.tsx",
  "components/groups/group-lesson-duration-select.tsx",
  "components/groups/lesson-date-select.tsx",
  "components/groups/select-empty-state.tsx",
  "components/groups/group-form-empty-hints.ts",
  "components/groups/group-detail-client.tsx",
  "components/groups/group-detail-tabs.tsx",
  "components/groups/group-info-card.tsx",
  "components/groups/group-students-table.tsx",
  "components/groups/lesson-modifications/lesson-modifications-table.tsx",
  "components/groups/lesson-changes-tab.tsx",
  "lib/lesson-dates.ts",
  "lib/schemas/group-schema.ts",
  "components/teachers/teachers-client.tsx",
  "components/teachers/teachers-table.tsx",
  "components/teachers/teachers-heading.tsx",
  "components/teachers/teacher-row-actions.tsx",
  "components/teachers/edit-teacher-drawer.tsx",
  "components/teachers/edit-teacher-form.tsx",
  "lib/schemas/teacher-schema.ts",
  "components/teachers/teacher-profile-client.tsx",
  "components/teachers/teacher-profile-card.tsx",
  "components/teachers/teacher-profile-tabs.tsx",
  "components/teachers/teacher-groups-table.tsx",
  "components/teachers/teacher-stats-charts.tsx",
  "components/teachers/teacher-timeline-tab.tsx",
  "components/shared/salary-monthly-panel.tsx",
  "components/shared/salary-due-card.tsx",
  "components/payments/possible-deductions-info.tsx",
  "components/payments/overview/block-state.tsx",
  "components/reports/lesson-ratings/teacher-ratings-panel.tsx",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "dictionaries" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const scanFile = (file: string) => scanI18nCalls(readFileSync(file, "utf8"));

const files = walk(SRC);
const scans = files.map((file) => ({ file, ...scanFile(file) }));
const used = new Set(scans.flatMap((s) => s.literals));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const DICTIONARIES = { ru, de, en } as const;

describe("i18n coverage", () => {
  it("really walks the source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("lists only files that exist", () => {
    for (const f of STRICT_FILES) expect(existsSync(path.join(SRC, f)), f).toBe(true);
  });

  it("reads every t(…) and msg(…) call of the source: a first argument it cannot check is an error", () => {
    const offenders = scans.flatMap((s) => s.unsupported.map((call) => `${path.relative(SRC, s.file)}: ${call}`));
    expect(offenders, `write a string literal in each call, ok ? t("Ha") : t("Yo'q"):\n${offenders.join("\n")}`).toEqual([]);
  });

  it.each(Object.entries(DICTIONARIES))("%s translates every text of the strict files", (name, dictionary) => {
    const missing: string[] = [];
    for (const f of STRICT_FILES) {
      for (const literal of scanFile(path.join(SRC, f)).literals) {
        if (!(literal in dictionary)) missing.push(`${f}: ${literal}`);
      }
    }
    expect(missing, `${name} is missing:\n${missing.join("\n")}`).toEqual([]);
  });

  it("gives ru, de and en the same keys", () => {
    const keys = (d: Record<string, string>) => Object.keys(d).sort();
    expect(keys(de)).toEqual(keys(ru));
    expect(keys(en)).toEqual(keys(ru));
  });

  it.each(Object.entries({ ...DICTIONARIES, "uz-cyrl": uzCyrl }))("%s has no stale key, no empty text and matching placeholders", (name, dictionary) => {
    for (const [key, value] of Object.entries(dictionary)) {
      expect(used.has(key), `${name}: unused key «${key}»`).toBe(true);
      expect(value.trim(), `${name}: empty text for «${key}»`).not.toBe("");
      expect(placeholders(value), `${name}: placeholders of «${key}»`).toEqual(placeholders(key));
    }
  });
});
