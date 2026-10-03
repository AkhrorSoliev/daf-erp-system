"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { QollanmaSahifa } from "@/qollanma/turlar";
import { sahifaYoli } from "@/qollanma/sahifalar";

interface Yuklangan {
  kalit: string;
  Komponent: ComponentType | null;
}

export function QollanmaSheet({
  ochiq,
  onOchiqChange,
  sahifa,
  boshqalar,
}: {
  ochiq: boolean;
  onOchiqChange: (ochiq: boolean) => void;
  sahifa: QollanmaSahifa;
  boshqalar: QollanmaSahifa[];
}) {
  const kalit = `${sahifa.bolim}/${sahifa.sahifa}`;
  const [yuklangan, setYuklangan] = useState<Yuklangan | null>(null);
  const ochuvchi = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!ochiq) return;
    let bekor = false;
    import(`@/qollanma/kontent/${sahifa.bolim}/${sahifa.sahifa}.mdx`)
      .then((modul: { default: ComponentType }) => {
        if (!bekor) setYuklangan({ kalit, Komponent: modul.default });
      })
      .catch(() => {
        if (!bekor) setYuklangan({ kalit, Komponent: null });
      });
    return () => {
      bekor = true;
    };
  }, [ochiq, kalit, sahifa.bolim, sahifa.sahifa]);

  const joriy = yuklangan?.kalit === kalit ? yuklangan : null;

  return (
    <Sheet open={ochiq} onOpenChange={onOchiqChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 data-[side=right]:sm:max-w-2xl"
        onOpenAutoFocus={() => {
          ochuvchi.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(e) => {
          // Radix fokusni faqat o'z SheetTrigger'iga qaytaradi; bu panelni tashqi tugma ochadi.
          e.preventDefault();
          ochuvchi.current?.focus();
        }}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{sahifa.sarlavha}</SheetTitle>
          <SheetDescription>{sahifa.qisqacha}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!joriy ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : joriy.Komponent ? (
            <joriy.Komponent />
          ) : (
            <p className="text-muted-foreground">Qo&apos;llanmani yuklab bo&apos;lmadi. Sahifani yangilab ko&apos;ring.</p>
          )}
        </div>

        <SheetFooter className="border-t px-6 py-4">
          {boshqalar.length > 0 ? (
            <div className="text-sm">
              <p className="text-muted-foreground">Shu sahifa bo&apos;yicha yana:</p>
              <ul className="mt-1 space-y-1">
                {boshqalar.map((s) => (
                  <li key={sahifaYoli(s)}>
                    <Link href={sahifaYoli(s)} onClick={() => onOchiqChange(false)} className="text-primary hover:underline">
                      {s.sarlavha}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button asChild>
            <Link href={sahifaYoli(sahifa)} onClick={() => onOchiqChange(false)}>
              To&apos;liq sahifada ochish
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
