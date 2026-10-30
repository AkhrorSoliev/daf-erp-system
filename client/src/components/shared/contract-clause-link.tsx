"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useT } from "@/i18n/context";

/** Havola bo'la oladigan shartnoma bandlari (ADR-0142). */
export type ClauseNo = "3.2" | "3.5" | "3.7" | "5.1" | "6.2" | "6.3";

interface Clause {
  no: string;
  text: string;
}

/** Bandning matni — tizimdagi eng so'nggi shartnoma shabloni, bir marta yuklanadi. */
function useContractClause(no: ClauseNo, enabled: boolean) {
  return useQuery<Clause>({
    queryKey: ["contract-clause", no],
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await api.get<Clause[]>("/contract-documents/clauses", {
        params: { nos: no },
      });
      return res.data[0];
    },
  });
}

/**
 * «Shartnoma 3.2» havolasi: admin ekranida shartnoma bandi tilga olingan har
 * joyda band raqami shu komponent bilan yoziladi (qo'lda yozilmaydi). Bossa,
 * bandning to'liq matni ochiladi va admin butun qoidani o'qib chiqadi.
 * `note` — shu ekranga xos izoh (masalan, markaz qarori bilan hisobdan
 * chiqarilgani); matn bilan birga ko'rsatiladi.
 */
export function ContractClauseLink({
  no,
  note,
  children,
}: {
  no: ClauseNo;
  note?: ReactNode;
  children?: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useContractClause(no, open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary underline underline-offset-2 hover:opacity-80"
      >
        {children ?? t("Shartnoma {no}", { no })}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{t("Shartnoma {no}-band", { no })}</DialogTitle>
            <DialogDescription>
              {t("Shartnomaning aynan shu matni imzolanadi.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm leading-relaxed">
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            )}
            {isError && (
              <p className="text-muted-foreground">
                {t("Matnni yuklab bo'lmadi. Keyinroq urinib ko'ring.")}
              </p>
            )}
            {data && (
              <p>
                <span className="font-medium">{data.no}. </span>
                {data.text}
              </p>
            )}
            {note && (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground">
                {note}
              </p>
            )}
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("Yopish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
