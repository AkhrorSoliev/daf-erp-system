"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Info, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format-utils";
import api from "@/lib/api";
import { BotReportTable } from "./bot-report-table";

interface Summary {
  blocked: number;
  joinedViaGate: number;
  leftAfterJoin: number;
  organicJoins: number;
  stillMemberViaGate: number;
  waiting: number;
  conversionRate: number;
  channelMembers: number | null;
  gateEnabled: boolean;
  channel: string | null;
}

/**
 * Kartochka — raqam + sodda tushuntirish. Har bir ko'rsatkich yonida savol
 * belgisi bor, chunki bu raqamlarning ma'nosi o'z-o'zidan ravshan emas
 * (masalan "chin a'zo" nima uchun "a'zo bo'ldi" dan kam bo'lishi mumkin).
 */
function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "green" | "red" | "amber";
}) {
  const color =
    accent === "green"
      ? "text-green-600 dark:text-green-500"
      : accent === "red"
        ? "text-red-600 dark:text-red-500"
        : accent === "amber"
          ? "text-amber-600 dark:text-amber-500"
          : "";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
          {label}
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`${label} — izoh`}>
                <Info className="size-3.5 opacity-60" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{hint}</TooltipContent>
          </Tooltip>
        </div>
        <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export function BotReportClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("month") ?? "";

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Summary>("/telegram/channel-report/summary", {
        params: month ? { month } : {},
      });
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const handleMonthChange = (value: string) => {
    const qs = new URLSearchParams(searchParams.toString());
    if (value) qs.set("month", value);
    else qs.delete("month");
    const s = qs.toString();
    router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-10 text-center text-sm">
          Ma&apos;lumotni yuklab bo&apos;lmadi. Sahifani yangilab
          ko&apos;ring.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker
          value={month || null}
          onChange={handleMonthChange}
          placeholder="Butun davr"
          className="w-48"
        />
        {month && (
          <button
            type="button"
            onClick={() => handleMonthChange("")}
            className="text-muted-foreground hover:text-foreground text-sm underline"
          >
            Butun davrni ko&apos;rsatish
          </button>
        )}
      </div>

      {!summary.gateEnabled && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <Send className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">
                Kanal a&apos;zoligi tekshiruvi hozircha o&apos;chiq
              </p>
              <p className="text-muted-foreground mt-0.5">
                Bot foydalanuvchilardan kanalga a&apos;zo bo&apos;lishni
                so&apos;ramayapti, shuning uchun quyidagi raqamlar
                to&apos;planmaydi.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Kanal a'zolari"
          value={
            summary.channelMembers === null
              ? "—"
              : formatNumber(summary.channelMembers)
          }
          hint={`${summary.channel ?? "Kanal"} — hozirgi umumiy a'zolar soni. Bu raqam Telegram'dan jonli olinadi va hamma a'zoni o'z ichiga oladi.`}
        />
        <Stat
          label="Bot to'sgan"
          value={formatNumber(summary.blocked)}
          hint="Bot bilan ishlamoqchi bo'lgan, lekin kanalga a'zo bo'lmagani uchun to'xtatilgan odamlar soni."
        />
        <Stat
          label="Bot tufayli a'zo bo'lgan"
          value={formatNumber(summary.joinedViaGate)}
          accent="green"
          hint="To'silgandan KEYIN kanalga a'zo bo'lganlar. Bu — botning haqiqiy natijasi."
        />
        <Stat
          label="Keyin chiqib ketgan"
          value={formatNumber(summary.leftAfterJoin)}
          accent="red"
          hint="Bot tufayli a'zo bo'lib, keyinchalik kanaldan chiqib ketganlar. Vaqtinchalik a'zolikni ko'rsatadi."
        />
        <Stat
          label="Hozir ham a'zo"
          value={formatNumber(summary.stillMemberViaGate)}
          accent="green"
          hint="Bot tufayli kelgan va hozirgacha kanalda qolganlar. Eng ishonchli natija — bu raqam butun davr bo'yicha hisoblanadi, tanlangan oyga bog'liq emas."
        />
        <Stat
          label="Kutilmoqda"
          value={formatNumber(summary.waiting)}
          accent="amber"
          hint="To'silgan, lekin hali kanalga a'zo bo'lmagan odamlar. Ular botga qaytishi mumkin."
        />
      </div>

      <Card>
        <CardContent className="p-4 text-sm">
          <p className="font-medium">Qanday o&apos;qish kerak</p>
          <p className="text-muted-foreground mt-1">
            Bot <b>{formatNumber(summary.blocked)}</b> kishini to&apos;xtatdi,
            ulardan <b>{formatNumber(summary.joinedViaGate)}</b> tasi kanalga
            a&apos;zo bo&apos;ldi
            {summary.blocked > 0 && <> ({summary.conversionRate}%)</>}.
            {summary.leftAfterJoin > 0 && (
              <>
                {" "}
                Keyinchalik <b>{formatNumber(summary.leftAfterJoin)}</b> tasi
                chiqib ketdi.
              </>
            )}{" "}
            Bundan tashqari <b>{formatNumber(summary.organicJoins)}</b> kishi
            botsiz, o&apos;zi kanalga qo&apos;shilgan.
          </p>
        </CardContent>
      </Card>

      <BotReportTable />
    </div>
  );
}
