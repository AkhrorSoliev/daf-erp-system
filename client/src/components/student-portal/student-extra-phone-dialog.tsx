"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import {
  FpCodeInput,
  FpPhoneInput,
} from "@/components/auth/forgot-password-fields";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button, Field, Input } from "./lumio";
import { EXTRA_PHONE_QUERY_KEY } from "./lib/queries";
import type { ExtraPhoneStatus, StudentProfile } from "./lib/types";

export interface StudentExtraPhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "set" adds or changes the number (phone + password → SMS code); "remove" asks the password only. */
  mode: "set" | "remove";
}

type Stage = "form" | "code";

/**
 * The student's backup sign-in number (ADR-0067). A new number is confirmed by
 * a code to it, behind the current password (ADR-0031); removing it asks the
 * password alone. Every answer is the new status, written into the cache.
 */
export function StudentExtraPhoneDialog({
  open,
  onOpenChange,
  mode,
}: StudentExtraPhoneDialogProps) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>("form");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStage("form");
    setPhone("");
    setPassword("");
    setCode("");
    setCooldown(0);
    setError("");
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function applyStatus(status: ExtraPhoneStatus) {
    queryClient.setQueryData<ExtraPhoneStatus>(EXTRA_PHONE_QUERY_KEY, status);
    queryClient.setQueryData<StudentProfile>(
      ["student-portal", "profile"],
      (old) => (old ? { ...old, extraPhone: status.phone } : old),
    );
  }

  async function sendCode() {
    if (phone.length !== 9) {
      setError("Telefon raqamni to'liq kiriting");
      return;
    }
    if (!password) {
      setError("Joriy parolingizni kiriting");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.post<{ resendInSec: number }>(
        "/student-portal/extra-phone/send-code",
        { phone, currentPassword: password },
      );
      setStage("code");
      setCode("");
      setCooldown(res.data.resendInSec);
    } catch (err) {
      setError(
        getErrorMessage(err, "SMS yuborilmadi. Birozdan keyin qayta urinib ko'ring"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 4) {
      setError("Kod 4 xonali bo'lishi kerak");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.post<ExtraPhoneStatus>(
        "/student-portal/extra-phone/verify",
        { code },
      );
      applyStatus(res.data);
      toast.success("Zaxira raqam saqlandi");
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, "Kod noto'g'ri yoki muddati tugagan"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!password) {
      setError("Joriy parolingizni kiriting");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.post<ExtraPhoneStatus>(
        "/student-portal/extra-phone/remove",
        { currentPassword: password },
      );
      applyStatus(res.data);
      toast.success("Zaxira raqam o'chirildi");
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "remove"
      ? "Zaxira raqamni o'chirish"
      : stage === "code"
        ? "SMS kod"
        : "Zaxira raqam";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            {title}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "remove") void remove();
            else if (stage === "code") void verify();
            else void sendCode();
          }}
          className="space-y-4"
        >
          {mode === "set" && stage === "form" ? (
            <>
              <Field label="Yangi zaxira raqam">
                <FpPhoneInput lumio value={phone} onChange={setPhone} />
              </Field>
              <p className="px-1 text-xs font-semibold text-ink-500">
                Kod shu raqamga boradi. Tasdiqlangach bu raqam bilan ham tizimga
                kira olasiz.
              </p>
            </>
          ) : null}

          {mode === "set" && stage === "code" ? (
            <>
              <p className="text-sm font-semibold text-ink-500">
                Kod{" "}
                <span className="whitespace-nowrap font-bold text-ink-700">
                  {formatPhone(phone)}
                </span>{" "}
                raqamiga yuborildi.
              </p>
              <Field label="SMS kod">
                <FpCodeInput lumio value={code} onChange={setCode} />
              </Field>
            </>
          ) : null}

          {stage === "form" ? (
            <Field label="Joriy parolingiz">
              <Input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          ) : null}

          {error ? (
            <p role="alert" className="px-1 text-sm font-bold text-danger">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            {stage === "code" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void sendCode()}
                disabled={cooldown > 0 || busy}
              >
                {cooldown > 0
                  ? `Qayta yuborish (${cooldown}s)`
                  : "Kodni qayta yuborish"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Bekor qilish
              </Button>
            )}
            <Button type="submit" loading={busy}>
              {mode === "remove"
                ? "O'chirish"
                : stage === "code"
                  ? "Tasdiqlash"
                  : "Kod yuborish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
