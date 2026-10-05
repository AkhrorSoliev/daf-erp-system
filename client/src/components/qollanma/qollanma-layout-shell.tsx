"use client";

import { useState, type ReactNode } from "react";
import { PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { QollanmaNav } from "./qollanma-nav";

export function QollanmaLayoutShell({ children }: { children: ReactNode }) {
  const [ochiq, setOchiq] = useState(false);

  return (
    <Sheet open={ochiq} onOpenChange={setOchiq}>
      <div className="mx-auto flex w-full max-w-6xl gap-10 px-4 py-6 lg:px-6">
        <div className="min-w-0 flex-1">
          <div className="mb-4 lg:hidden">
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <PanelRight className="mr-2 size-4" aria-hidden />
                Bo&apos;limlar
              </Button>
            </SheetTrigger>
          </div>
          {children}
        </div>

        {/* O'ngda, chunki chapda ilovaning asosiy menyusi turadi. */}
        <aside className="hidden w-60 shrink-0 lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:border-l lg:pl-6">
          <QollanmaNav />
        </aside>
      </div>

      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>Qo&apos;llanma</SheetTitle>
          <SheetDescription className="sr-only">Qo&apos;llanma bo&apos;limlari</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <QollanmaNav onNavigate={() => setOchiq(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
