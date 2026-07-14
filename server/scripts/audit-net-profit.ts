/**
 * NET PROFIT AUDIT — READ-ONLY.
 *
 * Answers the CEO question: "aniq nechchi pul sof foyda oldik?" by itemizing
 * EVERY real cash outflow per Tashkent calendar month and comparing:
 *   • what the current report shows as netProfit (getFinancialOverview basis)
 *   • the TRUE cash-basis net profit (payments − gateway fees − ALL salary −
 *     ALL expenses incl. advances − refunds)
 * and printing the DELTA line-by-line so the missing outflows are explicit
 * (gateway provider fees + student refunds are NOT subtracted anywhere today).
 *
 * Writes NOTHING.
 *
 * Usage (from server/):
 *   railway run npx ts-node scripts/audit-net-profit.ts          # PROD (Neon)
 *   npx ts-node scripts/audit-net-profit.ts                      # local dev DB
 */
import { som, dbEnvLabel, run } from './lib/check-cli';

const COMPANY_ID = 1001;

// Tashkent = UTC+5. We slice by createdAt/date the same way the services do:
// [YYYY-MM-01 00:00 UTC, last day 23:59:59.999 UTC]. Good enough for a monthly
// audit (the services themselves use naive UTC boundaries).
function monthRange(year: number, month1to12: number) {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999));
  const key = `${year}-${String(month1to12).padStart(2, '0')}`;
  return { start, end, key };
}

run(async (prisma) => {
  console.log(`\n=== NET PROFIT AUDIT — ${dbEnvLabel()} — company ${COMPANY_ID} ===`);

  const months = [
    monthRange(2026, 5),
    monthRange(2026, 6),
    monthRange(2026, 7),
  ];

  for (const m of months) {
    const tsFilter = { gte: m.start, lte: m.end };
    // date-only column (Expense.date) — compare against date objects at midnight
    const dateFilter = { gte: m.start, lte: new Date(m.end.toISOString().slice(0, 10)) };

    // ── INFLOWS ─────────────────────────────────────────────────────────────
    const paymentsAgg = await prisma.payment.aggregate({
      where: { companyId: COMPANY_ID, status: 'COMPLETED', createdAt: tsFilter },
      _sum: { amount: true, providerFee: true },
      _count: true,
    });
    const paymentsCompleted = paymentsAgg._sum.amount ?? 0;
    const providerFees = paymentsAgg._sum.providerFee ?? 0;

    // ── SALARY (cash out) ───────────────────────────────────────────────────
    const salaryPayments = await prisma.salaryPayment.findMany({
      where: { companyId: COMPANY_ID, status: 'PAID', paidAt: tsFilter },
      select: { amount: true, _count: { select: { accruals: true } } },
    });
    let teacherSalary = 0;
    let adminSalary = 0;
    for (const sp of salaryPayments) {
      if (sp._count.accruals > 0) teacherSalary += sp.amount;
      else adminSalary += sp.amount;
    }
    const salaryPaid = teacherSalary + adminSalary;

    // ── EXPENSES (cash out) ─────────────────────────────────────────────────
    const expensesAgg = await prisma.expense.aggregate({
      where: { companyId: COMPANY_ID, deletedAt: null, date: dateFilter },
      _sum: { amount: true },
    });
    const advancesAgg = await prisma.expense.aggregate({
      where: {
        companyId: COMPANY_ID,
        deletedAt: null,
        category: 'TEACHER_ADVANCE',
        date: dateFilter,
      },
      _sum: { amount: true },
    });
    const expensesTotal = expensesAgg._sum.amount ?? 0;
    const teacherAdvances = advancesAgg._sum.amount ?? 0;
    const expensesExAdvance = expensesTotal - teacherAdvances;

    // ── REFUNDS (cash out — NOT counted in any netProfit today) ─────────────
    const refundTxns = await prisma.transaction.findMany({
      where: { companyId: COMPANY_ID, type: 'REFUND', createdAt: tsFilter },
      select: { amount: true, reversedAt: true },
    });
    const refundsSigned = refundTxns.reduce((s, t) => s + t.amount, 0);
    const refundsActive = refundTxns
      .filter((t) => !t.reversedAt)
      .reduce((s, t) => s + t.amount, 0);
    const refundsCashOut = Math.abs(refundsActive);

    // Cross-check against the Refund model
    const refundModelAgg = await prisma.refund.aggregate({
      where: {
        companyId: COMPANY_ID,
        status: 'COMPLETED',
        updatedAt: tsFilter,
      },
      _sum: { approvedAmount: true },
    });

    // ── ACCRUED teacher salary (deserved this month, mostly unpaid in cash) ──
    // Σ non-reversed SalaryAccrual bucketed by effective payroll date
    // (COALESCE(creditPeriodDate, lessonDate) ∈ month). This is the teacher
    // COST the month actually earned — the cash SalaryPayment lands a cycle later.
    const accruals = await prisma.salaryAccrual.findMany({
      where: {
        companyId: COMPANY_ID,
        reversedAt: null,
        OR: [
          { creditPeriodDate: tsFilter },
          { creditPeriodDate: null, lessonDate: tsFilter },
        ],
      },
      select: { amount: true, isCenterTopUp: true },
    });
    const accruedTeacherSalary = accruals.reduce((s, a) => s + a.amount, 0);
    const centerToppedUp = accruals
      .filter((a) => a.isCenterTopUp)
      .reduce((s, a) => s + a.amount, 0);

    // ── NON-CASH LOSSES (memo) ──────────────────────────────────────────────
    const writeOffAgg = await prisma.transaction.aggregate({
      where: { companyId: COMPANY_ID, type: 'DEBT_WRITE_OFF', createdAt: tsFilter },
      _sum: { amount: true },
    });
    const writeOffs = Math.abs(writeOffAgg._sum.amount ?? 0);

    const adjustmentTxns = await prisma.transaction.findMany({
      where: { companyId: COMPANY_ID, type: 'ADJUSTMENT', createdAt: tsFilter },
      select: { amount: true },
    });
    const adjustmentsSigned = adjustmentTxns.reduce((s, t) => s + t.amount, 0);

    // ── NET PROFIT VARIANTS ─────────────────────────────────────────────────
    // (A) Current reported basis (getFinancialOverview). Advances are netted
    //     out of Xarajatlar; only settled advances fold into salary. For this
    //     audit we approximate with the raw figures (advancesPaid≈settled over
    //     a stable month) so the DELTA to the true-cash figure is what matters.
    const reportedNet =
      paymentsCompleted - (expensesExAdvance + salaryPaid);

    // (B) TRUE cash basis — literal bank-balance delta from operations.
    const trueCashNet =
      paymentsCompleted - providerFees - salaryPaid - expensesTotal - refundsCashOut;

    // (C) True cash minus the non-cash write-off loss (economic result).
    const economicNet = trueCashNet - writeOffs;

    // (D) TRUE ACCRUAL basis — the honest monthly result: real cash received
    //     minus the teacher salary this month EARNED (not the ~0 paid in cash),
    //     minus admin salary, minus expenses (avanssiz — advance isn't a cost
    //     until earned), minus refunds, minus the non-cash write-off loss.
    const accrualNet =
      paymentsCompleted -
      providerFees -
      accruedTeacherSalary -
      adminSalary -
      expensesExAdvance -
      refundsCashOut -
      writeOffs;

    console.log(`\n──────── ${m.key} ────────`);
    console.log(`  KIRIM`);
    console.log(`    To'lovlar (COMPLETED)          ${som(paymentsCompleted)}  (${paymentsAgg._count} ta)`);
    console.log(`    − Gateway komissiyasi          ${som(providerFees)}  ← hech qayerda ayirilmaydi`);
    console.log(`    = Sof tushgan naqd             ${som(paymentsCompleted - providerFees)}`);
    console.log(`  CHIQIM`);
    console.log(`    Ustoz oyligi (naqd)            ${som(teacherSalary)}`);
    console.log(`    Admin oyligi (naqd)            ${som(adminSalary)}`);
    console.log(`    Xarajatlar (avanssiz)          ${som(expensesExAdvance)}`);
    console.log(`    Ustoz avanslari                ${som(teacherAdvances)}`);
    console.log(`    Qaytarishlar (REFUND)          ${som(refundsCashOut)}  ← hech qayerda ayirilmaydi`);
    console.log(`  HISOBLANGAN USTOZ OYLIGI (accrual — shu oy earned)`);
    console.log(`    Ustoz oyligi (hisoblangan)     ${som(accruedTeacherSalary)}  ← shundan markaz qo'shimchasi ${som(centerToppedUp)}`);
    console.log(`  MEMO (naqdsiz)`);
    console.log(`    Kechirilgan qarz (write-off)   ${som(writeOffs)}`);
    console.log(`    Tuzatishlar (ADJUSTMENT, signed) ${som(adjustmentsSigned)}`);
    console.log(`    Refund model (COMPLETED)       ${som(refundModelAgg._sum.approvedAmount ?? 0)}`);
    console.log(`    refundsSigned / active         ${som(refundsSigned)} / ${som(refundsActive)}`);
    console.log(`  NATIJA`);
    console.log(`    (A) Hozir hisobotda            ${som(reportedNet)}`);
    console.log(`    (B) HAQIQIY sof foyda (naqd)   ${som(trueCashNet)}`);
    console.log(`    (C) Iqtisodiy (write-off bilan) ${som(economicNet)}`);
    console.log(`    (D) HAQIQIY (hisoblangan oylik) ${som(accrualNet)}  ← eng to'g'ri oylik natija`);
    console.log(`    Δ  A − D (haqiqiy farq)        ${som(reportedNet - accrualNet)}  = ustoz oyligi ${som(accruedTeacherSalary)} + refund ${som(refundsCashOut)} + write-off ${som(writeOffs)} − avans farqi`);
  }

  console.log('\n=== tugadi ===\n');
});
