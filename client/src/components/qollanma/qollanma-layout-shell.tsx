"use client";

import { useState, type ReactNode } from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { QollanmaNav } from "./qollanma-nav";

export function QollanmaLayoutShell({ children }: { children: ReactNode }) {
  const [ochiq, setOchiq] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-10 px-4 py-6 lg:px-6">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pr-2">
          <QollanmaNav />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 lg:hidden">
          <Button variant="outline" size="sm" onClick={() => setOchiq(true)}>
            <PanelLeft className="mr-2 size-4" aria-hidden />
            Bo&apos;limlar
          </Button>
        </div>
        {children}
      </div>

      <Sheet open={ochiq} onOpenChange={setOchiq}>
        <SheetContent side="left" className="flex flex-col gap-0 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>Qo&apos;llanma</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <QollanmaNav onNavigate={() => setOchiq(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
