"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ArrowLeft, Wallet } from "lucide-react";

function formatBalance(balance: number) {
  return balance.toLocaleString("uz-UZ");
}

export function PaymentResultPage() {
  const router = useRouter();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["student-portal", "profile"],
    queryFn: () => api.get("/student-portal/profile").then((r) => r.data),
    staleTime: 0,
  });

  // Auto-redirect after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/portal/payments");
    }, 10_000);
    return () => clearTimeout(timer);
  }, [router]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto space-y-4">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
    );
  }

  const balance = profile?.balance ?? 0;
  const isPositive = balance >= 0;

  return (
    <div className="p-4 md:p-6 max-w-md mx-auto">
      <div className="rounded-lg border bg-card p-6 text-center space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
            <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold">
            To&apos;lov jarayoni yakunlandi
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            To&apos;lovingiz qayta ishlanmoqda. Balans bir necha daqiqa ichida
            yangilanadi.
          </p>
        </div>

        <div className="rounded-lg bg-muted/50 p-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Wallet className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Joriy balans
            </span>
          </div>
          <p
            className={`text-xl font-bold ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            {isPositive ? "" : "-"}
            {formatBalance(Math.abs(balance))} so&apos;m
          </p>
        </div>

        <Button
          onClick={() => router.replace("/portal/payments")}
          className="w-full"
          variant="outline"
        >
          <ArrowLeft className="mr-2 size-4" />
          To&apos;lovlarga qaytish
        </Button>

        <p className="text-xs text-muted-foreground">
          10 soniyadan keyin avtomatik qaytariladi
        </p>
      </div>
    </div>
  );
}
