"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Wallet, Clock, BookOpen, CreditCard, ArrowRight } from "lucide-react";

function formatBalance(balance: number) {
  return balance.toLocaleString("en-US");
}

const PAYMENT_METHODS = [
  {
    id: "payme",
    name: "Payme",
    logo: "/payme-logo.png",
    imgClass: "h-7 w-30 object-cover",
  },
  {
    id: "click",
    name: "Click",
    logo: "/click-logo.png",
    imgClass: "h-25 w-30 object-contain",
  },
  {
    id: "uzum",
    name: "Uzum Bank",
    logo: "/uzum-bank.svg",
    imgClass: "h-10 w-auto object-contain",
  },
] as const;

const QUICK_AMOUNTS = [
  100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 700_000,
];

export function StudentPaymentSummary() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["student-portal", "profile"],
    queryFn: () => api.get("/student-portal/profile").then((r) => r.data),
  });

  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [showComingSoon, setShowComingSoon] = useState(false);

  const selectedInfo = PAYMENT_METHODS.find((m) => m.id === selectedMethod);

  const handleAmountChange = (value: string) => {
    const digits = value.replace(/\D/g, "");
    setAmount(digits);
  };

  const displayAmount =
    amount && Number(amount) > 0 ? Number(amount).toLocaleString("en-US") : "";

  const handleQuickAmount = (val: number) => {
    setAmount(String(val));
  };

  const handleProceed = () => {
    setShowComingSoon(true);
  };

  const handleClose = () => {
    setSelectedMethod(null);
    setAmount("");
    setShowComingSoon(false);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <Wallet className="size-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Ma&apos;lumotlarni yuklashda xatolik
        </p>
      </div>
    );
  }

  const balance = profile.balance ?? 0;
  const isPositive = balance >= 0;
  const groups = profile.groups ?? [];

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3 mb-3">
          <Wallet className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground font-medium">
            Joriy balans
          </p>
        </div>
        <p
          className={`text-2xl font-bold ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
        >
          {isPositive ? "" : "-"}
          {formatBalance(Math.abs(balance))} so&apos;m
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {isPositive ? "Balans ijobiy" : "Qarzdorlik mavjud"}
        </p>
      </div>

      {groups.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Faol kurslar
          </h3>
          {groups.map((group: any) => (
            <div
              key={group.id}
              className="rounded-lg border bg-card p-4 flex items-center gap-3"
            >
              <BookOpen className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{group.name}</p>
                {group.course_name && (
                  <p className="text-xs text-muted-foreground">
                    {group.course_name}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Separator />

      {/* To'lov usullari */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground">
            Balansni to&apos;ldirish
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.id}
              onClick={() => {
                setSelectedMethod(method.id);
                setAmount("");
                setShowComingSoon(false);
              }}
              className="h-15 flex items-center justify-center rounded-lg border bg-white p-1 transition-colors hover:bg-gray-50 active:scale-95"
            >
              <img
                src={method.logo}
                alt={method.name}
                className={method.imgClass}
              />
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <PaymentHistory />

      {/* Summa kiritish dialog */}
      <Dialog
        open={!!selectedMethod}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm">
          {!showComingSoon ? (
            <>
              <DialogHeader>
                <DialogTitle>To&apos;lov summasi</DialogTitle>
                <DialogDescription>
                  {selectedInfo?.name} orqali to&apos;lanadigan summani kiriting
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 overflow-hidden">
                {/* Logo */}
                <div className="flex justify-center">
                  {selectedInfo && (
                    <div className="rounded-lg bg-white p-2">
                      <img
                        src={selectedInfo.logo}
                        alt={selectedInfo.name}
                        className="h-10 w-28 object-cover max-w-full"
                      />
                    </div>
                  )}
                </div>

                {/* Summa input */}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={displayAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="Summani kiriting"
                    className="box-border w-full rounded-lg border bg-background px-4 py-3 text-center text-lg font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    autoFocus
                  />
                  {amount && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground py-20">
                      so&apos;m
                    </span>
                  )}
                </div>

                {/* Tezkor summalar */}
                <div className="flex gap-2 overflow-x-auto pb-4 -mx-1 px-1">
                  {QUICK_AMOUNTS.map((val) => (
                    <button
                      key={val}
                      onClick={() => handleQuickAmount(val)}
                      className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted/50 active:scale-95"
                    >
                      {formatBalance(val)}
                    </button>
                  ))}
                </div>

                {/* Davom etish */}
                <Button
                  onClick={handleProceed}
                  disabled={!amount || Number(amount) < 1000}
                  className="w-full"
                >
                  Davom etish
                  <ArrowRight className="ml-2 size-4" />
                </Button>

                {Number(amount) > 0 && Number(amount) < 1000 && (
                  <p className="text-xs text-center text-red-500">
                    Minimal summa: 1,000 so&apos;m
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-center">
                  Tez orada ishga tushiriladi
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-center py-4">
                {selectedInfo && (
                  <div className="inline-block rounded-lg bg-white p-2 mx-auto">
                    <img
                      src={selectedInfo.logo}
                      alt={selectedInfo.name}
                      className="h-10 w-auto object-contain"
                    />
                  </div>
                )}
                <p className="text-2xl font-bold">{displayAmount} so&apos;m</p>
                <p className="text-sm text-muted-foreground">
                  {selectedInfo?.name} orqali online to&apos;lov tizimi tez
                  orada ishga tushiriladi. Iltimos, hozircha kassaga murojaat
                  qiling.
                </p>
                <Button
                  onClick={handleClose}
                  variant="outline"
                  className="w-full"
                >
                  Yopish
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const methodLabels: Record<string, string> = {
  CASH: "Naqd",
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
};

const typeLabels: Record<string, string> = {
  PAYMENT: "To'lov",
  LESSON_DEDUCTION: "Dars uchun",
  REFUND: "Qaytarildi",
  ADJUSTMENT: "Tuzatish",
};

function PaymentHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ["student-portal", "payments"],
    queryFn: () => api.get("/student-portal/payments").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }

  const transactions = data?.transactions ?? [];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">
        Balans tarixi
      </h3>
      {transactions.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/40 p-8 text-center">
          <Clock className="size-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">Hali tranzaksiya yo&apos;q</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map(
            (t: {
              id: string;
              type: string;
              amount: number;
              balanceAfter: number;
              description: string | null;
              createdAt: string;
            }) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border bg-card p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {t.description || typeLabels[t.type] || t.type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(t.createdAt), "dd.MM.yyyy, HH:mm")}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-bold ${t.amount >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {t.amount >= 0 ? "+" : ""}
                    {t.amount.toLocaleString("en-US")} so&apos;m
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.balanceAfter.toLocaleString("en-US")} so&apos;m
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
