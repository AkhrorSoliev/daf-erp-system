"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatBalance } from "@/lib/format-utils";
import { CheckCircle, CaretLeft } from "@phosphor-icons/react";
import { Screen, Card, Button, Skeleton } from "./lumio";
import type { StudentProfile } from "./lib/types";

export function PaymentResultPage() {
  const router = useRouter();

  const { data: profile, isLoading } = useQuery<StudentProfile>({
    queryKey: ["student-portal", "profile"],
    queryFn: () => api.get("/student-portal/profile").then((r) => r.data),
    staleTime: 0,
  });

  useEffect(() => {
    const timer = setTimeout(() => router.replace("/portal/payments"), 10_000);
    return () => clearTimeout(timer);
  }, [router]);

  if (isLoading) {
    return (
      <Screen>
        <div className="mx-auto w-full max-w-sm space-y-4">
          <Skeleton className="h-56" />
        </div>
      </Screen>
    );
  }

  const balance = profile?.balance ?? 0;
  const inDebt = balance < 0;

  return (
    <Screen>
      <div className="mx-auto w-full max-w-sm">
        <Card clay tone="neutral" className="space-y-5 py-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/12 text-success">
            <CheckCircle size={40} weight="fill" />
          </span>

          <div className="space-y-1.5">
            <h2 className="font-display text-xl font-extrabold text-ink-900">
              To&apos;lov jarayoni yakunlandi
            </h2>
            <p className="text-sm font-semibold text-ink-500">
              To&apos;lovingiz qayta ishlanmoqda. Balans bir necha daqiqa ichida
              yangilanadi.
            </p>
          </div>

          <div className="inset-well rounded-card bg-sunk p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-500">
              Joriy balans
            </p>
            <p
              className={`mt-1 font-display text-2xl font-extrabold ${inDebt ? "text-danger" : "text-success"}`}
            >
              {formatBalance(balance)}
            </p>
          </div>

          <Button
            variant="secondary"
            block
            onClick={() => router.replace("/portal/payments")}
            iconBefore={<CaretLeft size={18} weight="bold" />}
          >
            To&apos;lovlarga qaytish
          </Button>

          <p className="text-xs font-semibold text-ink-400">
            10 soniyadan keyin avtomatik qaytariladi
          </p>
        </Card>
      </div>
    </Screen>
  );
}
