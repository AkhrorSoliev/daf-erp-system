/** `GET /month-close/:month` (server `MonthCloseView`). Every figure is the server's. */
export interface MonthCloseView {
  month: string;
  ended: boolean;
  netProfit: {
    revenue: number;
    balanceWithdrawals: number;
    teacherSalary: number;
    adminSalary: number;
    operatingExpenses: number;
    refunds: number;
    netProfit: number;
    taxes: {
      providerFees: number;
      turnoverTax: number;
      employerSocialTax: number;
      withholding: number;
      bankPaidSalary: number;
      total: number;
      missingRates: string[];
    };
  };
  bankAccounts: { id: string; name: string; branchId: number; branchName: string; amount: number | null }[];
  salaries: { paid: number; total: number };
  checklist: { bankFeesEntered: boolean; salariesPaid: boolean; ratesComplete: boolean };
}

/** `PUT /month-close/:month/bank-fees`. */
export interface BankFeesBody {
  items: { cashAccountId: string; amount: number }[];
}
