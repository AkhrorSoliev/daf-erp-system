"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { Clock, CircleNotch } from "@phosphor-icons/react";
import {
  Screen,
  ScreenHeader,
  Card,
  Badge,
  EmptyState,
  LoadingCards,
  FadeIn,
} from "./lumio";
import { useStudentProfile } from "./lib/queries";
import { loadState } from "./lib/load-state";
import { LoadFailed } from "./load-failed";
import { StatementCard } from "./statement-card";
import type { PaymentHistory as PaymentHistoryData } from "./lib/types";

const QUICK_AMOUNTS = [
  100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 700_000,
];
const MIN_PAYMENT = 1000;

const PROVIDERS = [
  { id: "PAYME", name: "Payme", logo: "/payme-logo-v2.png", available: true },
  { id: "CLICK", name: "Click", logo: "/click-logo-v2.png", available: true },
  { id: "UZUM", name: "Uzum Bank", logo: "/uzum-bank.svg", available: false },
] as const;

const TYPE_LABELS: Record<string, string> = {
  PAYMENT: "To'lov",
  LESSON_DEDUCTION: "Dars uchun",
  REFUND: "Qaytarildi",
  ADJUSTMENT: "Tuzatish",
  INITIAL_BALANCE: "Boshlang'ich balans",
  BALANCE_WITHDRAWAL: "Yechildi",
};

export function StudentPaymentSummary() {
  const queryClient = useQueryClient();
  const profileQuery = useStudentProfile();
  const { data: profile } = profileQuery;

  const [amount, setAmount] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  // On return from the gateway (tab regains focus) reset + refetch the balance.
  useEffect(() => {
    if (!redirecting) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setAmount("");
        setRedirecting(false);
        queryClient.invalidateQueries({
          queryKey: ["student-portal", "profile"],
        });
        queryClient.invalidateQueries({
          queryKey: ["student-portal", "payments"],
        });
        toast.success("Balansingiz tekshirilmoqda...");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const timeout = setTimeout(() => setRedirecting(false), 20000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timeout);
    };
  }, [redirecting, queryClient]);

  async function pay(method: "PAYME" | "CLICK") {
    const val = Number(amount);
    if (!val || val < MIN_PAYMENT) {
      toast.error(`Minimal summa: ${formatNumber(MIN_PAYMENT)} so'm`);
      return;
    }
    setRedirecting(true);
    try {
      const { data } = await api.post("/student-portal/payments/init", {
        amount: val,
        method,
        returnUrl: `${window.location.origin}/portal/payments/result`,
      });
      // `assign`, not `location.href = …`: the React Compiler's immutability
      // rule reads the assignment as mutating a value defined outside the
      // component. It is the same navigation either way, and this form says
      // "go here" rather than "change this property".
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      toast.error(getErrorMessage(err, "To'lov tizimida xatolik yuz berdi"));
      setRedirecting(false);
    }
  }

  if (loadState(profileQuery) === "loading") {
    return (
      <Screen>
        <ScreenHeader title="To'lovlar" />
        <LoadingCards count={2} />
      </Screen>
    );
  }

  // Keep the page's title and give a way back: this used to be a bare
  // message asking the student to reload the page themselves.
  if (!profile) {
    return (
      <Screen>
        <ScreenHeader title="To'lovlar" />
        <LoadFailed query={profileQuery} />
      </Screen>
    );
  }

  const balance = profile.balance ?? 0;
  const inDebt = balance < 0;
  const belowMin = Number(amount) > 0 && Number(amount) < MIN_PAYMENT;

  return (
    <Screen>
      <ScreenHeader title="To'lovlar" />

      {/*
        `grid-cols-1`, not a bare `grid`: an implicit column is sized to its
        widest unbreakable child, while `grid-cols-1` is `minmax(0, 1fr)` and
        stays the width of the screen.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          {/* Balance */}
          <FadeIn index={0}>
            <Card clay tone="neutral" className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-500">
                Joriy balans
              </p>
              <p
                className={`font-display text-[26px] font-extrabold leading-none tabular-nums sm:text-[30px] ${inDebt ? "text-danger" : "text-success"}`}
              >
                {formatBalance(balance)}
              </p>
              <Badge tone={inDebt ? "danger" : "success"} size="sm">
                {inDebt ? "Qarzdorlik mavjud" : "Balans ijobiy"}
              </Badge>
            </Card>
          </FadeIn>

          {/* Payment statement (PDF) */}
          <FadeIn index={1}>
            <StatementCard />
          </FadeIn>

          {/* Top-up. A size container: the quick amounts go to one row of
              seven only when the card itself is wide enough for them. */}
          <FadeIn index={2}>
            <Card className="@container space-y-4">
              <h2 className="font-display text-lg font-bold text-ink-900">
                Balansni to&apos;ldirish
              </h2>

              <div className="inset-well flex items-center justify-center gap-2 rounded-md bg-sunk px-4 py-3">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="To'lov summasi"
                  value={amount ? formatNumber(Number(amount)) : ""}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))
                  }
                  placeholder="0"
                  disabled={redirecting}
                  className="w-full bg-transparent text-center font-display text-2xl font-extrabold text-ink-900 outline-none placeholder:text-ink-400"
                />
                <span className="shrink-0 font-display font-bold text-ink-500">
                  so&apos;m
                </span>
              </div>

              {/*
                A grid, never a sideways-scrolling strip. The strip's chips
                could not shrink, so it set the page's minimum width: on a
                390px phone the page laid out 627px wide, with Click, "so'm"
                and the amounts in Balans tarixi past the right edge. On a
                desktop it hid the last amounts from anyone without a trackpad.
              */}
              <div className="grid grid-cols-4 gap-2 @lg:grid-cols-7">
                {QUICK_AMOUNTS.map((val) => {
                  const selected = Number(amount) === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={redirecting}
                      aria-pressed={selected}
                      onClick={() => setAmount(String(val))}
                      className={cn(
                        "h-9 rounded-pill border font-display text-xs font-bold tabular-nums transition-colors active:scale-95 disabled:opacity-50",
                        selected
                          ? "border-coral-500 bg-coral-500/12 text-coral-700 dark:text-coral-400"
                          : "border-line bg-surface text-ink-700 hover:bg-tint",
                      )}
                    >
                      {formatNumber(val)}
                    </button>
                  );
                })}
              </div>

              {belowMin ? (
                <p className="text-center text-xs font-bold text-danger">
                  Minimal summa: {formatNumber(MIN_PAYMENT)} so&apos;m
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                {PROVIDERS.filter((p) => p.available).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={redirecting}
                    // While redirecting the logo becomes a spinner, which
                    // would leave the button with no name at all.
                    aria-label={`${p.name} orqali to'lash`}
                    onClick={() => pay(p.id as "PAYME" | "CLICK")}
                    className="clay-white clay-btn flex h-14 items-center justify-center overflow-hidden rounded-card border border-line bg-white px-3 disabled:opacity-60"
                  >
                    {redirecting ? (
                      <CircleNotch
                        size={24}
                        weight="bold"
                        className="animate-spin text-ink-500"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.logo}
                        alt={p.name}
                        className="max-h-8 w-auto max-w-full object-contain"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-center gap-2 opacity-70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/uzum-bank.svg"
                  alt="Uzum Bank"
                  // Grey, the purple wordmark is near-black: invisible on the
                  // dark card without the invert.
                  className="h-5 object-contain grayscale dark:invert"
                />
                <Badge tone="neutral" size="sm">
                  Tez kunda
                </Badge>
              </div>

              {redirecting ? (
                <p className="flex items-center justify-center gap-2 text-center text-sm font-bold text-ink-500">
                  <CircleNotch
                    size={16}
                    weight="bold"
                    className="animate-spin"
                  />
                  To&apos;lov sahifasiga o&apos;tkazilmoqda...
                </p>
              ) : null}
            </Card>
          </FadeIn>
        </div>

        <FadeIn index={3}>
          <PaymentHistory />
        </FadeIn>
      </div>
    </Screen>
  );
}

function PaymentHistory() {
  const history = useQuery<PaymentHistoryData>({
    queryKey: ["student-portal", "payments"],
    queryFn: () => api.get("/student-portal/payments").then((r) => r.data),
  });
  const { data } = history;
  const state = loadState(history);
  const transactions = data?.transactions ?? [];

  return (
    <div className="space-y-2.5">
      <h2 className="px-1 font-display text-lg font-bold text-ink-900">
        Balans tarixi
      </h2>
      {state === "loading" ? (
        <LoadingCards count={3} />
      ) : state !== "ready" ? (
        // No answer is not "no transactions yet".
        <LoadFailed query={history} />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={<Clock weight="bold" />}
          title="Hali tranzaksiya yo'q"
          description="To'lov qilganingizdan so'ng bu yerda ko'rinadi."
        />
      ) : (
        transactions.map((t) => {
          const positive = t.amount >= 0;
          return (
            <Card
              key={t.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                {/* Two lines, not one: on a narrow phone a single line cut
                    "A1-12 guruhi: 12 dars uchun" down to its first words. */}
                <p className="line-clamp-2 break-words font-display text-sm font-bold text-ink-900">
                  {t.description || TYPE_LABELS[t.type] || t.type}
                </p>
                <p className="text-xs font-semibold text-ink-500">
                  {format(new Date(t.createdAt), "dd.MM.yyyy, HH:mm")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`font-display text-sm font-extrabold tabular-nums ${positive ? "text-success" : "text-danger"}`}
                >
                  {positive ? "+" : ""}
                  {formatNumber(t.amount)} so&apos;m
                </p>
                <p className="text-xs font-semibold tabular-nums text-ink-500">
                  {formatNumber(t.balanceAfter)} so&apos;m
                </p>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
