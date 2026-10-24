"use client";

import { useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEditHoliday, type Holiday } from "@/hooks/use-edit-holiday";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { mayManageHoliday } from "@/lib/holiday-scope";
import { useT } from "@/i18n/context";
import { markedText, unmarked } from "@/components/payments/debt-history/marked-text";

interface HolidayRowActionsProps {
  holiday: Holiday;
  onDeleted?: (id: string) => void;
}

export function HolidayRowActions({
  holiday,
  onDeleted,
}: HolidayRowActionsProps) {
  const t = useT();
  const { openDrawer } = useEditHoliday();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Identity, not a capability: a centre-wide holiday is the CEO's alone.
  const isCeo = useAuth((s) => s.user?.roles.some((r) => r.id === 1) ?? false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/holidays/${holiday.id}`);
      toast.success(t("Bayram muvaffaqiyatli o'chirildi"));
      onDeleted?.(holiday.id);
      setConfirmOpen(false);
    } catch (err) {
      toast.error(
        getErrorMessage(err, t("Bayramni o'chirishda xatolik yuz berdi")),
      );
    } finally {
      setDeleting(false);
    }
  };

  const formattedDate = (() => {
    if (!holiday.date) return "";
    const startStr = format(new Date(holiday.date), "dd.MM.yyyy");
    if (!holiday.endDate || holiday.endDate === holiday.date) return startStr;
    const endStr = format(new Date(holiday.endDate), "dd.MM.yyyy");
    return `${startStr} — ${endStr}`;
  })();

  // CEO decision 10.10.2026: only the CEO edits or deletes a centre-wide
  // holiday, and the server refuses everyone else. Hide the menu, don't
  // offer a 403.
  if (!mayManageHoliday(isCeo, holiday.branchId)) return null;

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => e.stopPropagation()}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="size-4" />
                )}
                <span className="sr-only">{t("Amallar")}</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("Amallar")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => openDrawer(holiday)}>
            <Pencil className="mr-2 size-4" />
            {t("Tahrirlash")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="mr-2 size-4" />
            {t("O'chirish")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Bayramni o'chirishni xohlaysizmi?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {markedText(
                t(
                  "**{name}**{date} bayrami o'chiriladi. Agar bu bayram tufayli ba'zi guruhlarning tugash sanasi avtomatik uzaytirilgan bo'lsa, ular asl tugash sanasiga qaytariladi. Bu amalni keyinroq qaytarib bo'lmaydi.",
                  {
                    name: unmarked(holiday.name),
                    date: formattedDate ? ` (${formattedDate})` : "",
                  },
                ),
                "font-medium",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("Bekor qilish")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              variant="destructive"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("O'chirish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
