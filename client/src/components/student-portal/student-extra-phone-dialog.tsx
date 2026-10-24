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
import { useT } from "@/i18n/context";
import {
  CODE_LENGTH,
  CODE_WRONG,
  PASSWORD_REQUIRED,
  PHONE_INCOMPLETE,
  REMOVE_FAILED,
  SMS_NOT_SENT,
  portalFormError,
} from "./lib/form-error";

export interface StudentExtraPhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "set" adds or changes the number (phone + password → SMS code); "remove" asks the password only. */
  mode: "set" | "remove";
}

type Stage = "form" | "code";

/**
 * The student's backup sign-in number (ADR-0070). A new number is confirmed by
 * a code to it, behind the current password (ADR-0031); removing it asks the
 * password alone. Every answer is the new status, written into the cache.
 */
export function StudentExtraPhoneDialog({
  open,
  onOpenChange,
  mode,
}: StudentExtraPhoneDialogProps) {
  const t = useT();
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
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // A request in flight cannot be walked away from: a late answer would land
  // in a dialog that was already closed and reset. The password never outlives
  // the dialog.
  function handleOpenChange(next: boolean) {
    if (!next && busy) return;
    if (!next) setPassword("");
    onOpenChange(next);
  }

  // Success path: `busy` is still true here, so it bypasses the guard above.
  function finish() {
    setPassword("");
    onOpenChange(false);
  }

  function backToForm() {
    setStage("form");
    setCode("");
    setPassword("");
    setError("");
  }

  function applyStatus(status: ExtraPhoneStatus) {
    queryClient.setQueryData<ExtraPhoneStatus>(EXTRA_PHONE_QUERY_KEY, status);
    queryClient.setQueryData<StudentProfile>(
      ["student-portal", "profile"],
      (old) => (old ? { ...old, extraPhone: status.phone } : old),
    );
  }

  async function sendCode() {
    if (phone.length !== 9) {
      setError(PHONE_INCOMPLETE);
      return;
    }
    if (!password) {
      setError(PASSWORD_REQUIRED);
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
      setError(getErrorMessage(err, SMS_NOT_SENT));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 4) {
      setError(CODE_LENGTH);
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
      toast.success(t("Zaxira raqam saqlandi"));
      finish();
    } catch (err) {
      setError(getErrorMessage(err, CODE_WRONG));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!password) {
      setError(PASSWORD_REQUIRED);
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
      toast.success(t("Zaxira raqam o'chirildi"));
      finish();
    } catch (err) {
      setError(getErrorMessage(err, REMOVE_FAILED));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "remove"
      ? t("Zaxira raqamni o'chirish")
      : stage === "code"
        ? t("SMS kod")
        : t("Zaxira raqam");
  // The number is drawn bold inside the sentence: split around its placeholder.
  const [sentBefore, sentAfter = ""] = t("Kod {phone} raqamiga yuborildi.").split(
    "{phone}",
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            {title}
          </DialogTitle>
        </DialogHeader>
        {/* noValidate: our own messages below speak, not the browser's tooltip. */}
        <form
          noValidate
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
              <Field label={t("Yangi zaxira raqam")}>
                <FpPhoneInput lumio value={phone} onChange={setPhone} />
              </Field>
              <p className="px-1 text-xs font-semibold text-ink-500">
                {t(
                  "Kod shu raqamga boradi. Tasdiqlangach bu raqam bilan ham tizimga kira olasiz.",
                )}
              </p>
            </>
          ) : null}

          {mode === "set" && stage === "code" ? (
            <>
              <p className="text-sm font-semibold text-ink-500">
                {sentBefore}
                <span className="whitespace-nowrap font-bold text-ink-700">
                  {formatPhone(phone)}
                </span>
                {sentAfter}
              </p>
              <Field label={t("SMS kod")}>
                <FpCodeInput lumio value={code} onChange={setCode} />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={backToForm}
                disabled={busy}
              >
                {t("Raqamni o'zgartirish")}
              </Button>
            </>
          ) : null}

          {mode === "remove" ? (
            <p className="px-1 text-xs font-semibold text-ink-500">
              {t("O'chirilgach bu raqam bilan tizimga kira olmaysiz.")}
            </p>
          ) : null}

          {stage === "form" ? (
            <Field label={t("Joriy parolingiz")}>
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
              {portalFormError(t, error)}
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
                  ? t("Qayta yuborish ({n}s)", { n: cooldown })
                  : t("Kodni qayta yuborish")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={busy}
              >
                {t("Bekor qilish")}
              </Button>
            )}
            <Button
              type="submit"
              variant={mode === "remove" ? "danger" : "primary"}
              loading={busy}
            >
              {mode === "remove"
                ? t("O'chirish")
                : stage === "code"
                  ? t("Tasdiqlash")
                  : t("Kod yuborish")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
