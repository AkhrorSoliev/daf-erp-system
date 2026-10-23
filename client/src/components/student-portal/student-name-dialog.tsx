"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button, Input, Field } from "./lumio";
import { useStudentProfile } from "./lib/queries";
import type { StudentProfile } from "./lib/types";
import { useT } from "@/i18n/context";

export interface StudentNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Edit first/last name. Controlled from the screen that owns the name it edits
// (Profile). The mutation writes straight into the shared profile cache, so the
// rail, the More hub and the Profile heading all update from one write.
export function StudentNameDialog({
  open,
  onOpenChange,
}: StudentNameDialogProps) {
  const t = useT();
  const { data: profile } = useStudentProfile();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Seed the fields each time the dialog opens so a cancelled edit never leaves
  // stale text behind for the next one.
  useEffect(() => {
    if (!open) return;
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
  }, [open, profile?.firstName, profile?.lastName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true);
    try {
      const res = await api.patch("/student-portal/name", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      queryClient.setQueryData<StudentProfile>(
        ["student-portal", "profile"],
        (old) =>
          old
            ? {
                ...old,
                firstName: res.data.firstName,
                lastName: res.data.lastName,
              }
            : old,
      );
      toast.success(t("Ism va familiya yangilandi"));
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, t("Saqlashda xatolik")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            {t("Ism va familiya")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("Ism")}>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("Ismingiz")}
              minLength={2}
              required
            />
          </Field>
          <Field label={t("Familiya")}>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t("Familiyangiz")}
              minLength={2}
              required
            />
          </Field>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t("Bekor qilish")}
            </Button>
            <Button type="submit" loading={loading}>
              {t("Saqlash")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
