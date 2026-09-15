"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { oxirgiFaollikMatni, StudentActivityPanel } from "./student-activity-panel";
import type { Davr } from "./types";

export function StudentActivitySheet({
  groupId,
  studentId,
  davr,
  onDavrChange,
  onClose,
}: {
  groupId: string;
  studentId: number | null;
  davr: Davr;
  onDavrChange: (d: Davr) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {studentId !== null && (
          <StudentActivityPanel
            url={`/groups/${groupId}/app-activity/students/${studentId}`}
            davr={davr}
            onDavrChange={onDavrChange}
            bodyClassName="flex-1 overflow-y-auto px-6 py-5"
            renderHeader={(data, meta) => (
              <SheetHeader className="border-b px-6 py-4">
                {data ? (
                  <>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-11">
                        <AvatarImage src={data.photo ?? undefined} alt="" />
                        <AvatarFallback>{boshHarflar(data.ism)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <SheetTitle className="truncate">{data.ism}</SheetTitle>
                        <SheetDescription>Oxirgi faollik: {oxirgiFaollikMatni(data)}</SheetDescription>
                      </div>
                    </div>
                    {data.akkaunt && meta}
                  </>
                ) : (
                  <>
                    <SheetTitle className="sr-only">O&apos;quvchi faolligi</SheetTitle>
                    <Skeleton className="h-11 w-56" />
                  </>
                )}
              </SheetHeader>
            )}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function boshHarflar(ism: string): string {
  return ism
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}
