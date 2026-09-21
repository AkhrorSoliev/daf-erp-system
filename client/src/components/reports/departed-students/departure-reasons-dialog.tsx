"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EXIT_TYPE_OPTIONS,
  ReasonListManager,
} from "@/components/settings/reason-list-manager";

interface DepartureReasonsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shortcut to the exit-reason list from the report that is read against it.
 * The list itself now lives at Sozlamalar → Sabablar, together with the
 * transfer and teacher-change lists; this dialog is the same editor rendered
 * where the reader already is.
 */
export function DepartureReasonsDialog({
  open,
  onOpenChange,
}: DepartureReasonsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ketish va status sabablari</DialogTitle>
          <DialogDescription>
            O&apos;quvchi guruhdan chiqarilganda, muzlatilganda yoki
            chetlatilganda ko&apos;rsatiladigan sabablarni boshqaring
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto overscroll-contain pr-1">
          <ReasonListManager
            endpoint="/student-exit-reasons"
            queryKey="student-exit-reasons"
            addPlaceholder="Yangi sabab nomi"
            tags={{
              label: "Qaysi holatlarga taalluqli:",
              options: EXIT_TYPE_OPTIONS,
              defaultValue: ["GROUP_REMOVAL"],
            }}
          />
        </div>

        <Link
          href="/settings/reasons"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Guruh almashtirish va ustoz o&apos;zgarishi sabablari
          <ArrowUpRight className="size-3" />
        </Link>
      </DialogContent>
    </Dialog>
  );
}
