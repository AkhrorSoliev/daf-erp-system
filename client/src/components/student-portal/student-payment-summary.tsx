"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Wallet, Clock, BookOpen } from "lucide-react";

function formatBalance(balance: number) {
  return balance.toLocaleString("en-US");
}

export function StudentPaymentSummary() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["student-portal", "profile"],
    queryFn: () => api.get("/student-portal/profile").then((r) => r.data),
  });

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
        <p className="text-sm text-muted-foreground">Ma'lumotlarni yuklashda xatolik</p>
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
          <p className="text-sm text-muted-foreground font-medium">Joriy balans</p>
        </div>
        <p className={`text-2xl font-bold ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {isPositive ? "" : "-"}{formatBalance(Math.abs(balance))} so'm
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {isPositive ? "Balans ijobiy" : "Qarzdorlik mavjud"}
        </p>
      </div>

      {groups.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Faol kurslar</h3>
          {groups.map((group: any) => (
            <div key={group.id} className="rounded-lg border bg-card p-4 flex items-center gap-3">
              <BookOpen className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{group.name}</p>
                {group.course_name && <p className="text-xs text-muted-foreground">{group.course_name}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">To'lov tarixi</h3>
        <div className="rounded-lg border border-dashed bg-muted/40 p-8 text-center">
          <Clock className="size-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">Tez orada qo'shiladi</p>
          <p className="text-xs text-muted-foreground mt-1">To'lov tarixi tez orada bu yerda ko'rsatiladi</p>
        </div>
      </div>
    </div>
  );
}
