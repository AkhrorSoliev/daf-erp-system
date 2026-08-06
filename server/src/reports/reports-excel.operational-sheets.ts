/**
 * Operational (non-financial) sheet builders for the "Moliyaviy hisobot"
 * workbook — the business half that turns the finance report into a full
 * management report: KPI paneli / Lidlar / O'quvchilar oqimi / Xonalar
 * bandligi / Guruhlar to'ldirilishi / Davomat / O'qituvchilar samaradorligi /
 * O'qituvchi o'zgarishlari.
 *
 * Every figure comes straight from the already-delegated ReportsService
 * methods (getKpis / getRoomUtilization / getGroupAnalytics / getLeadAnalytics
 * / getAttendanceAnalytics / getTeacherPerformance / getDepartedStudents* /
 * getTeacherChangesList). Each builder is defensive: a `null` dataset (its
 * source threw) renders an "ma'lumot yo'q" note instead of crashing the whole
 * workbook. Same visual language as the financial sheets (shared helpers).
 */
import { Workbook, Worksheet, Row } from 'exceljs';
import {
  NUM,
  PCT,
  SUBTLE,
  sheetTitle,
  sectionHeader,
  tableHeader,
  kvRow,
  freezeAndFilter,
  sheetNotes,
  dataBar,
  colorScale,
  fmtDate,
  dmy,
  tashkentTodayStr,
} from './reports-excel.helpers';

const DEC1 = '#,##0.0';

// ---- Local label maps (operational enums). ----
const GROUP_STATUS_LABELS: Record<string, string> = {
  FORMING: 'Shakllanmoqda',
  ACTIVE: 'Faol',
  PAUSED: "To'xtatilgan",
  COMPLETED: 'Tugagan',
  CANCELLED: 'Bekor qilingan',
  ARCHIVED: 'Arxivlangan',
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: 'Yangi',
  CONTACTED: "Bog'lanildi",
  TRIAL: 'Sinov darsi',
  CONVERTED: "O'quvchiga aylandi",
  LOST: "Yo'qotilgan",
  ARCHIVED: 'Arxivlangan',
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  ADDED: "Qo'shildi",
  REMOVED: 'Olib tashlandi',
  REPLACED: 'Almashtirildi',
};

// ---- Local row helpers (plain-number KV — helpers.kvRow is money/percent only). ----

/** Label / integer-value (/ izoh) row. `fmt` overrides the default plain NUM. */
function kvNum(
  ws: Worksheet,
  label: string,
  value: number,
  izoh?: string,
  opts: { fmt?: string; bold?: boolean } = {},
): Row {
  const r = ws.addRow([label, value, izoh ?? '']);
  if (opts.bold) r.font = { bold: true };
  r.getCell(2).numFmt = opts.fmt ?? NUM;
  const ic = r.getCell(3);
  ic.font = { italic: true, size: 9, color: { argb: SUBTLE } };
  ic.alignment = { wrapText: true, vertical: 'top' };
  return r;
}

/** "Manba xizmat javob bermadi" placeholder when a dataset came back null. */
function emptyNote(ws: Worksheet): void {
  const r = ws.addRow(["Ma'lumot hozircha mavjud emas (manba xizmat javob bermadi)."]);
  r.getCell(1).font = { italic: true, color: { argb: SUBTLE } };
}

/** Signed percent for inline izoh text, e.g. "+12%" / "-4%". */
function signedPct(v: number | null | undefined): string {
  if (v == null) return "ma'lumot yo'q";
  return `${v >= 0 ? '+' : ''}${v}%`;
}

// ---- Op-1: KPI paneli ----
export function kpiSheet(wb: Workbook, kpis: any, period: string) {
  const ws = wb.addWorksheet('KPI paneli');
  ws.columns = [{ width: 34 }, { width: 18 }, { width: 46 }];
  sheetTitle(ws, "KPI paneli — asosiy ko'rsatkichlar", period, 3);
  if (!kpis) {
    emptyNote(ws);
    return;
  }
  kvNum(ws, "Faol o'quvchilar", kpis.activeStudents?.current ?? 0, `O'tgan oyga nisbatan: ${signedPct(kpis.activeStudents?.trend)}`);
  kvNum(ws, 'Faol guruhlar', kpis.activeGroups ?? 0);
  kvRow(ws, "O'rtacha davomat", kpis.averageAttendance ?? 0, 'Shu oy; sababli (EXCUSED) hisobga olinmagan.', { percent: true });
  kvRow(ws, "Lid → o'quvchi konversiya", kpis.leadConversionRate ?? 0, "Lidlarning necha foizi o'quvchiga aylandi.", { percent: true });
  kvNum(ws, "Shu oy yangi o'quvchilar", kpis.newStudentsThisMonth ?? 0);
  kvNum(ws, 'Shu oy ketganlar (churn)', kpis.churnedThisMonth ?? 0, "Chetlatilgan + guruhdan chiqarilgan.");
  sheetNotes(ws, [
    "Markazning asosiy sog'liq ko'rsatkichlari — bir qarashda umumiy holat.",
    "Diqqat: bu raqamlar JORIY OY holati (tanlangan hisobot davriga bog'liq emas).",
    "Konversiya — lidlar bilan bog'liq; batafsili \"Lidlar\" bo‘limida.",
    "Davomat va churn — \"Davomat\" va \"O'quvchilar oqimi\" bo‘limlarida batafsil.",
  ], 3);
}

// ---- Op-2: Lidlar (marketing voronkasi) ----
export function leadsSheet(wb: Workbook, leads: any, period: string) {
  const ws = wb.addWorksheet('Lidlar');
  ws.columns = [{ width: 26 }, { width: 14 }, { width: 16 }, { width: 16 }];
  sheetTitle(ws, 'Lidlar — marketing voronkasi', period, 4);
  if (!leads) {
    emptyNote(ws);
    return;
  }
  sectionHeader(ws, "Voronka (holat bo'yicha)", 4);
  tableHeader(ws, ['Holat', 'Soni']);
  (leads.funnel ?? []).forEach((f: any) => {
    const r = ws.addRow([LEAD_STATUS_LABELS[f.status] ?? f.status, f.count ?? 0]);
    r.getCell(2).numFmt = NUM;
  });

  sectionHeader(ws, 'Konversiya (oxirgi 6 oy)', 4);
  const ch = tableHeader(ws, ['Oy', 'Jami lid', 'Konvertatsiya', 'Konversiya %']);
  const first = ch.number + 1;
  (leads.conversionRateOverTime ?? []).forEach((m: any) => {
    const r = ws.addRow([m.month, m.total ?? 0, m.converted ?? 0, m.rate ?? 0]);
    r.getCell(2).numFmt = NUM;
    r.getCell(3).numFmt = NUM;
    r.getCell(4).numFmt = PCT;
  });
  const last = ws.rowCount;
  if (last >= first) colorScale(ws, `D${first}:D${last}`);

  sectionHeader(ws, "O'rtacha konversiya vaqti", 4);
  kvNum(ws, "Lid → o'quvchi (kun)", leads.averageDaysToConversion ?? 0, "O'rtacha necha kunda o'quvchiga aylanadi.", { fmt: DEC1 });

  sheetNotes(ws, [
    "Voronka — lidlar hozir qaysi bosqichda (yangi / bog'lanilgan / sinov / aylangan / yo'qotilgan).",
    "Konversiya % = o'sha oyda kelgan lidlarning o'quvchiga aylangan ulushi.",
    "Diqqat: lidlar tizimda kompaniya bo'yicha ajratilmagan — bu markaz miqyosidagi umumiy raqam.",
    "Konversiya jadvali doim oxirgi 6 oyni ko'rsatadi — tanlangan davrdan qat'i nazar.",
  ], 4);
}

// ---- Op-3: O'quvchilar oqimi (kelish / ketish) ----
export function studentFlowSheet(
  wb: Workbook,
  summary: any,
  dynamics: any,
  reasons: any,
  period: string,
) {
  const ws = wb.addWorksheet("O'quvchilar oqimi");
  ws.columns = [{ width: 36 }, { width: 18 }, { width: 46 }];
  sheetTitle(ws, "O'quvchilar oqimi — kelish / ketish", period, 3);

  sectionHeader(ws, "Umumiy ko'rsatkichlar (joriy holat)", 3);
  if (summary) {
    kvRow(ws, 'Churn (ketish) foizi', summary.churnRate ?? 0, "Ketganlar / jami o'quvchi.", { percent: true });
    kvNum(ws, "Ketgan o'quvchilar", summary.departedCount ?? 0);
    kvNum(ws, "Jami o'quvchilar (ketgan + hozirgi)", summary.totalStudents ?? 0);
    kvRow(ws, "Yo'qolgan daromad", summary.lostRevenue ?? 0, "Ketganlarning to'lanmagan qoldig'i.");
    kvRow(ws, 'Jami qarz (ketganlar)', summary.totalDebt ?? 0, "Manfiy balanslar yig'indisi.");
    kvNum(ws, 'Qarzdorlar soni', summary.debtorCount ?? 0);
    kvNum(ws, "O'rtacha davomiylik (oy)", summary.avgDurationMonths ?? 0, "O'quvchi o'rtacha necha oy o'qigan.", { fmt: DEC1 });
    kvNum(ws, "Ustoz o'zgarishlari (davr)", summary.totalTeacherChanges ?? 0);
    kvNum(ws, "Ustoz o'zgarishidan keyin ketganlar", summary.departedAfterTeacherChange ?? 0);
  } else {
    emptyNote(ws);
  }

  sectionHeader(ws, 'Oylik dinamika (ketganlar)', 3);
  const dh = tableHeader(ws, ['Oy', 'Ketganlar']);
  const first = dh.number + 1;
  (dynamics?.data ?? []).forEach((d: any) => {
    const r = ws.addRow([typeof d.date === 'string' ? d.date.slice(0, 7) : d.date, d.count ?? 0]);
    r.getCell(2).numFmt = NUM;
  });
  const last = ws.rowCount;
  if (last >= first) dataBar(ws, `B${first}:B${last}`);

  sectionHeader(ws, 'Ketish sabablari', 3);
  tableHeader(ws, ['Sabab', 'Soni']);
  (reasons?.data ?? []).forEach((rs: any) => {
    const r = ws.addRow([rs.reasonName ?? "Noma'lum", rs.count ?? 0]);
    r.getCell(2).numFmt = NUM;
  });

  sheetNotes(ws, [
    "O'quvchilarning markazga kelishi va ketishi — churn, sabablar va oylik dinamika.",
    "Diqqat: churn / qarz / yo'qolgan daromad — JORIY holat (tanlangan davrga bog'liq emas).",
    "Faqat ustoz-o'zgarish raqamlari tanlangan davrni hisobga oladi.",
    "\"Ketganlar\" — guruhdan chiqib ketgan yozuvlar (bir o'quvchi bir necha guruhda hisoblanishi mumkin).",
  ], 3);
}

// ---- Op-4: Xonalar bandligi ----
export function roomUtilizationSheet(wb: Workbook, util: any, period: string) {
  const ws = wb.addWorksheet('Xonalar bandligi');
  ws.columns = [{ width: 26 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 16 }, { width: 16 }];
  // Every sheet in the report states its window in the same fixed shape — a
  // dated "Bugungi holat" rather than a vague "period-independent" label.
  sheetTitle(ws, 'Xonalar bandligi', `Bugungi holat: ${dmy(tashkentTodayStr())}`, 6);
  if (!util) {
    emptyNote(ws);
    return;
  }
  const header = tableHeader(ws, ['Xona', "Sig'im", 'Guruhlar', "O'quvchilar", 'Haftalik soat', "To'ldirilish %"]);
  const first = header.number + 1;
  (util.rooms ?? []).forEach((rm: any) => {
    const r = ws.addRow([
      rm.name,
      rm.capacity ?? '—',
      rm.totalGroups ?? 0,
      rm.totalEnrolled ?? 0,
      rm.hoursPerWeek ?? 0,
      rm.fillRate ?? '—',
    ]);
    [2, 3, 4].forEach((c) => {
      if (typeof r.getCell(c).value === 'number') r.getCell(c).numFmt = NUM;
    });
    r.getCell(5).numFmt = DEC1;
    if (typeof r.getCell(6).value === 'number') r.getCell(6).numFmt = PCT;
  });
  const last = ws.rowCount;
  if (last >= first) colorScale(ws, `F${first}:F${last}`);
  freezeAndFilter(ws, header.number, 6);
  const s = util.summary ?? {};
  sheetNotes(ws, [
    `Jami xonalar: ${s.totalRooms ?? 0}; o'rtacha to'ldirilish: ${s.averageFillRate ?? 0}%.`,
    `Eng band xona: ${s.mostUtilized ?? '—'}; eng bo'sh: ${s.leastUtilized ?? '—'}.`,
    "To'ldirilish % = xonadagi guruhlar o'quvchilari sig'imga nisbatan. Rang: qizil = bo'sh, yashil = to'la.",
    "Diqqat: bu joriy holat (tanlangan hisobot davriga bog'liq emas).",
  ], 6);
}

// ---- Op-5: Guruhlar to'ldirilishi ----
export function groupFillSheet(wb: Workbook, groups: any, period: string) {
  const ws = wb.addWorksheet("Guruhlar to'ldirilishi");
  ws.columns = [{ width: 32 }, { width: 14 }, { width: 12 }, { width: 16 }];
  // Same fixed "Bugungi holat: DD.MM.YYYY" shape as every other live-state sheet.
  sheetTitle(ws, "Guruhlar to'ldirilishi", `Bugungi holat: ${dmy(tashkentTodayStr())}`, 4);
  if (!groups) {
    emptyNote(ws);
    return;
  }
  sectionHeader(ws, 'Holat taqsimoti', 4);
  tableHeader(ws, ['Holat', 'Guruhlar soni']);
  (groups.statusDistribution ?? []).forEach((s: any) => {
    const r = ws.addRow([GROUP_STATUS_LABELS[s.status] ?? s.status, s.count ?? 0]);
    r.getCell(2).numFmt = NUM;
  });

  sectionHeader(ws, "To'ldirilish (kam to'lgan tepada)", 4);
  const header = tableHeader(ws, ['Guruh', "O'quvchi", "Sig'im", "To'ldirilish %"]);
  const first = header.number + 1;
  (groups.fillRates ?? []).forEach((g: any) => {
    const r = ws.addRow([g.groupName, g.enrolled ?? 0, g.capacity ?? '—', g.fillRate ?? '—']);
    r.getCell(2).numFmt = NUM;
    if (typeof r.getCell(3).value === 'number') r.getCell(3).numFmt = NUM;
    if (typeof r.getCell(4).value === 'number') r.getCell(4).numFmt = PCT;
  });
  const last = ws.rowCount;
  if (last >= first) colorScale(ws, `D${first}:D${last}`);

  sheetNotes(ws, [
    `Shakllanayotgan (forming) guruhlar: ${(groups.formingGroups ?? []).length} ta — to'ldirish uchun diqqat talab.`,
    "Kam to'lgan guruhlar yuqorida — birinchi navbatda ularga e'tibor kerak.",
    "To'ldirilish % = o'quvchilar soni guruh sig'imiga nisbatan. Rang: qizil = past, yashil = to'la.",
    "Diqqat: bu joriy holat (tanlangan hisobot davriga bog'liq emas).",
  ], 4);
}

// ---- Op-6: Davomat ----
export function attendanceSheet(wb: Workbook, att: any, period: string) {
  const ws = wb.addWorksheet('Davomat');
  ws.columns = [{ width: 30 }, { width: 16 }, { width: 16 }];
  sheetTitle(ws, "Davomat ko'rsatkichi", period, 3);
  if (!att) {
    emptyNote(ws);
    return;
  }
  sectionHeader(ws, 'Umumiy', 3);
  kvRow(ws, 'Umumiy davomat', att.overallRate ?? 0, 'Sababli (EXCUSED) maxrajdan chiqarilgan.', { percent: true });
  if (att.overallRetention != null) {
    kvRow(ws, 'Retention (ushlab qolish)', att.overallRetention, "Davr oxiri / davr boshi o'quvchi soni.", { percent: true });
  }
  const sb = att.statusBreakdown ?? {};
  kvNum(ws, 'Keldi (present)', sb.present ?? 0);
  kvNum(ws, 'Kelmadi (absent)', sb.absent ?? 0);
  kvNum(ws, 'Kech keldi (late)', sb.late ?? 0);
  kvNum(ws, 'Sababli (excused)', sb.excused ?? 0);
  kvNum(ws, 'Jami belgilangan', sb.total ?? 0);

  sectionHeader(ws, `Trend (${att.bucket === 'month' ? 'oylik' : 'haftalik'})`, 3);
  const th = tableHeader(ws, ['Davr', 'Davomat %', 'Retention %']);
  const first = th.number + 1;
  (att.trend ?? []).forEach((t: any) => {
    const r = ws.addRow([t.label, t.rate ?? 0, t.retentionPct ?? '—']);
    r.getCell(2).numFmt = PCT;
    if (typeof r.getCell(3).value === 'number') r.getCell(3).numFmt = PCT;
  });
  const last = ws.rowCount;
  if (last >= first) colorScale(ws, `B${first}:B${last}`);

  sectionHeader(ws, "Hafta kunlari bo'yicha", 3);
  tableHeader(ws, ['Kun', 'Davomat %']);
  (att.byDayOfWeek ?? []).forEach((d: any) => {
    const r = ws.addRow([d.day, d.rate ?? 0]);
    r.getCell(2).numFmt = PCT;
  });

  sectionHeader(ws, 'Eng yaxshi guruhlar', 3);
  tableHeader(ws, ['Guruh', 'Davomat %']);
  (att.bestGroups ?? []).forEach((g: any) => {
    const r = ws.addRow([g.groupName, g.rate ?? 0]);
    r.getCell(2).numFmt = PCT;
  });

  sectionHeader(ws, 'Eng past guruhlar', 3);
  tableHeader(ws, ['Guruh', 'Davomat %']);
  (att.worstGroups ?? []).forEach((g: any) => {
    const r = ws.addRow([g.groupName, g.rate ?? 0]);
    r.getCell(2).numFmt = PCT;
  });

  sheetNotes(ws, [
    "Davomat foizi = kelgan darslar / (jami − sababli). Past davomat = daromad va churn xavfi.",
    "Retention — davr davomida o'quvchilarni ushlab qolish ulushi.",
    "Eng past guruhlar — birinchi navbatda e'tibor talab qiladi.",
    "Rang: qizil = past davomat, yashil = yuqori.",
  ], 3);
}

// ---- Op-7: O'qituvchilar samaradorligi ----
export function teacherPerformanceSheet(wb: Workbook, perf: any, period: string) {
  const ws = wb.addWorksheet("O'qituvchilar samaradorligi");
  ws.columns = [
    { width: 28 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 },
  ];
  sheetTitle(ws, "O'qituvchilar samaradorligi", period, 7);
  if (!perf) {
    emptyNote(ws);
    return;
  }
  const teachers = perf.teachers ?? [];
  const header = tableHeader(ws, [
    'Ustoz', 'Guruhlar', "O'quvchilar", 'Boshi → Oxiri', 'Retention %', "O'rt. davomat %", "To'ldirilish %",
  ]);
  const first = header.number + 1;
  teachers.forEach((t: any) => {
    const r = ws.addRow([
      `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim(),
      t.groupsCount ?? 0,
      t.totalStudents ?? 0,
      `${t.startStudentCount ?? 0} → ${t.endStudentCount ?? 0}`,
      t.retentionPct ?? '—',
      t.averageAttendance ?? '—',
      t.averageFillRate ?? '—',
    ]);
    [2, 3].forEach((c) => (r.getCell(c).numFmt = NUM));
    [5, 6, 7].forEach((c) => {
      if (typeof r.getCell(c).value === 'number') r.getCell(c).numFmt = PCT;
    });
  });
  const last = ws.rowCount;
  if (last >= first) colorScale(ws, `F${first}:F${last}`);
  freezeAndFilter(ws, header.number, 7);
  const notes = [
    "Har ustoz: guruh soni, o'quvchi soni, retention, o'rtacha davomat va guruh to'ldirilishi.",
    "\"Boshi → Oxiri\" — davr boshidagi va oxiridagi o'quvchi soni (retention shundan).",
    'Rang (o\'rt. davomat): qizil = past, yashil = yuqori.',
    "Faqat ACTIVE/FORMING guruhlar; davr boshi tizim boshlanish sanasigacha cheklangan.",
  ];
  if ((perf.total ?? 0) > teachers.length) {
    notes.push(`Diqqat: jami ${perf.total} ustozdan faqat birinchi ${teachers.length} tasi ko'rsatildi (sahifalash chegarasi).`);
  }
  sheetNotes(ws, notes, 7);
}

// ---- Op-8: O'qituvchi o'zgarishlari ----
export function teacherChangesSheet(wb: Workbook, changes: any, period: string) {
  const ws = wb.addWorksheet("O'qituvchi o'zgarishlari");
  ws.columns = [
    { width: 12 }, { width: 26 }, { width: 18 }, { width: 20 },
    { width: 24 }, { width: 24 }, { width: 22 }, { width: 20 },
  ];
  sheetTitle(ws, "O'qituvchi o'zgarishlari", period, 8);
  const rows = Array.isArray(changes) ? changes : [];
  const header = tableHeader(ws, [
    'Sana', 'Guruh', 'Filial', 'Kurs', 'Oldingi ustoz(lar)', 'Yangi ustoz(lar)', 'Sabab', "O'zgartirdi",
  ]);
  rows.forEach((c: any) => {
    ws.addRow([
      fmtDate(c.changedAt),
      c.groupName ?? '',
      c.branchName ?? '',
      c.courseName ?? '',
      (c.previousTeachers ?? []).join(', '),
      (c.newTeachers ?? []).join(', '),
      c.reasonName ?? (CHANGE_TYPE_LABELS[c.changeType] ?? c.changeType ?? ''),
      c.changedBy ?? '',
    ]);
  });
  freezeAndFilter(ws, header.number, 8);
  sheetNotes(ws, [
    "Tanlangan davrda guruhlardagi ustoz almashinuvlari (qo'shildi / olib tashlandi / almashtirildi).",
    "\"Sabab\" — kiritilgan bo'lsa; aks holda o'zgarish turi ko'rsatiladi.",
    "Ustoz o'zgarishi ko'p bo'lgan guruhlar — o'quvchi ketishiga sabab bo'lishi mumkin (\"O'quvchilar oqimi\" bilan solishtiring).",
    "Bu ro'yxat davrni talab qiladi — davr tanlanmasa joriy oy olinadi.",
  ], 8);
}
