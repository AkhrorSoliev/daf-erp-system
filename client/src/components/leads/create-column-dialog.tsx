"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useLeadsBoard, type LeadBoardColumn } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useT } from "@/i18n/context";

export function CreateColumnDialog() {
  const t = useT();
  const open = useLeadsUi((s) => s.createColumnOpen);
  const closeCreateColumn = useLeadsUi((s) => s.closeCreateColumn);
  const addColumn = useLeadsBoard((s) => s.addColumn);
  // The board is per branch, so a column needs one. On "Barcha filiallar" the
  // server refuses (it cannot guess which board the user meant) — say so here
  // rather than letting them type a name and hit an error on submit.
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const noBranch = selectedBranch === null;

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("Ustun nomini kiriting"));
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<LeadBoardColumn>("/lead-columns", {
        name: trimmed,
      });
      addColumn(data);
      toast.success(t("Ustun yaratildi"));
      closeCreateColumn();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Ustun yaratishda xatolik yuz berdi")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && closeCreateColumn()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Yangi ustun")}</DialogTitle>
          <DialogDescription>
            {noBranch
              ? t("Har bir filialning o'z doskasi bor")
              : t("{branch} doskasining oxiriga qo'shiladi", {
                  branch: selectedBranch.name,
                })}
          </DialogDescription>
        </DialogHeader>

        {noBranch ? (
          <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            {t(
              "Ustun qaysi filialga tegishli ekani aniq bo'lishi kerak. Yuqoridagi filial almashtirgichdan bitta filialni tanlab, keyin qayta urinib ko'ring.",
            )}
          </p>
        ) : (
          <form
            id="create-column-form"
            onSubmit={handleSubmit}
            className="space-y-1.5"
          >
            <Label htmlFor="column-name">{t("Ustun nomi")}</Label>
            <Input
              id="column-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Masalan: Sinovga yozildi")}
              maxLength={100}
            />
          </form>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeCreateColumn}
            disabled={submitting}
          >
            {noBranch ? t("Yopish") : t("Bekor qilish")}
          </Button>
          {!noBranch && (
            <Button
              type="submit"
              form="create-column-form"
              disabled={submitting}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {t("Yaratish")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
