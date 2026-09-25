"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { freshSessionFrom } from "@/lib/fresh-session";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button, Input, Field } from "./lumio";

export interface StudentPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Change password. Both fields are wiped whenever the dialog closes — on
// cancel, on success, and on an outside click — so a half-typed old password is
// never left sitting in state.
export function StudentPasswordDialog({
  open,
  onOpenChange,
}: StudentPasswordDialogProps) {
  const [loading, setLoading] = useState(false);
  const setAuth = useAuth((s) => s.setAuth);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setOldPassword("");
      setNewPassword("");
    }
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPassword || !newPassword) return;
    setLoading(true);
    try {
      const { data } = await api.patch("/student-portal/password", {
        oldPassword,
        newPassword,
      });
      // The change ended every session of this account, this device's too;
      // the API returns a fresh pair so only the other devices sign out.
      const session = freshSessionFrom(data);
      if (session) {
        setAuth(session.user, session.accessToken, session.refreshToken);
      }
      toast.success(
        "Parol o'zgartirildi. Boshqa qurilmalardagi kirishlar tugatildi",
      );
      handleOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Parolni o'zgartirishda xatolik"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            Parolni o&apos;zgartirish
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Joriy parol">
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Joriy parolingiz"
              required
            />
          </Field>
          <Field label="Yangi parol">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Kamida 6 ta belgi"
              minLength={6}
              required
            />
          </Field>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Bekor qilish
            </Button>
            <Button type="submit" loading={loading}>
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
