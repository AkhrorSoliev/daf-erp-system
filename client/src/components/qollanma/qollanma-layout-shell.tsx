"use client";

import { useState, type ReactNode } from "react";
import { PanelLeft } from "lucide-react";
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
        {/* sticky ishlamaydi: SidebarInset'dagi overflow-x-hidden uni o'z aylantirish konteyneriga aylantiradi. */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <QollanmaNav />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 lg:hidden">
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <PanelLeft className="mr-2 size-4" aria-hidden />
                Bo&apos;limlar
              </Button>
            </SheetTrigger>
          </div>
          {children}
        </div>
      </div>

      <SheetContent side="left" className="flex flex-col gap-0 p-0">
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
