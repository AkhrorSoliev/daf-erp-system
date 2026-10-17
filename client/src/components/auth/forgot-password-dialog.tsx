"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone, formatPhoneInput } from "@/lib/format-utils";
import {
  type FpVariant,
  FpField,
  FpPhoneInput,
  FpCodeInput,
  FpPasswordInput,
  FpSubmit,
  FpError,
} from "./forgot-password-fields";

const RESEND_SECONDS = 60;

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `lumio` skins the dialog in the student portal's design system. The class
   * goes on `DialogContent` rather than an ancestor because Radix portals the
   * content to `document.body`, outside the page's `.lumio` wrapper.
   */
  variant?: FpVariant;
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  variant = "default",
}: ForgotPasswordDialogProps) {
  const lumio = variant === "lumio";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const reset = useCallback(() => {
    setStep(1);
    setPhone("");
    setCode("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setError("");
    setLoading(false);
    setCooldown(0);
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function sendCode() {
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password/request", { phone });
      setStep(2);
      setCooldown(RESEND_SECONDS);
    } catch {
      // The request endpoint always succeeds server-side; a failure here is a
      // network/server error — keep the message generic.
      setError("Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    if (phone.length !== 9) {
      setError("Telefon raqamni to'liq kiriting");
      return;
    }
    await sendCode();
  }

  async function handleResend() {
    if (cooldown > 0 || loading) return;
    await sendCode();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (code.length !== 4) {
      setError("Kod 4 xonali bo'lishi kerak");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password/verify", {
        phone,
        code,
      });
      setResetToken(res.data.resetToken);
      setStep(3);
    } catch (err) {
      setError(getErrorMessage(err, "Kod noto'g'ri yoki muddati tugagan"));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("Parol kamida 6 ta belgidan iborat bo'lishi kerak");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Parollar mos kelmadi");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password/reset", {
        resetToken,
        newPassword,
      });
      toast.success("Parol muvaffaqiyatli o'zgartirildi. Endi kirishingiz mumkin.");
      handleOpenChange(false);
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Sessiya muddati tugadi. Iltimos, qaytadan urinib ko'ring.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(lumio && "lumio", "sm:max-w-sm")}>
        <DialogHeader>
          <DialogTitle
            className={cn(lumio && "font-display text-xl font-extrabold")}
          >
            Parolni tiklash
          </DialogTitle>
          <DialogDescription className={cn(lumio && "font-semibold")}>
            {step === 1 &&
              "Telefon raqamingizni kiriting — SMS orqali tasdiqlash kodi yuboramiz."}
            {step === 2 && "Tasdiqlash kodi telefon raqamingizga yuborildi."}
            {step === 3 && "Yangi parolingizni o'rnating."}
          </DialogDescription>
        </DialogHeader>

        {error && <FpError lumio={lumio}>{error}</FpError>}

        {step === 1 && (
          <form onSubmit={handleRequest} className="space-y-4">
            <FpField lumio={lumio} label="Telefon raqam" htmlFor="fp-phone">
              <FpPhoneInput
                lumio={lumio}
                value={formatPhoneInput(phone)}
                onChange={setPhone}
              />
            </FpField>
            <FpSubmit lumio={lumio} loading={loading}>
              Kod yuborish
            </FpSubmit>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-1 text-center">
              <p
                className={cn(
                  "text-2xl font-bold tracking-tight tabular-nums sm:text-3xl",
                  lumio && "font-display font-extrabold text-ink-900",
                )}
              >
                {formatPhone(phone)}
              </p>
              <p
                className={cn(
                  "text-sm text-muted-foreground",
                  lumio && "font-semibold",
                )}
              >
                Ushbu raqamga yuborilgan 4 xonali kodni kiriting.
              </p>
            </div>
            <FpField lumio={lumio} label="Tasdiqlash kodi" htmlFor="fp-code">
              <FpCodeInput lumio={lumio} value={code} onChange={setCode} />
            </FpField>
            <div
              className={cn(
                "flex items-center justify-between text-sm",
                lumio && "font-bold",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setCode("");
                  setError("");
                }}
                className={cn(
                  "inline-flex items-center gap-1",
                  lumio
                    ? "text-ink-500 hover:text-ink-800"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ArrowLeft className="size-3.5" />
                Raqamni o&apos;zgartirish
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className={cn(
                  "hover:underline disabled:no-underline",
                  lumio
                    ? "text-coral-600 disabled:text-ink-400"
                    : "text-primary disabled:text-muted-foreground",
                )}
              >
                {cooldown > 0 ? `Qayta yuborish (${cooldown}s)` : "Qayta yuborish"}
              </button>
            </div>
            <FpSubmit lumio={lumio} loading={loading}>
              Tasdiqlash
            </FpSubmit>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleReset} className="space-y-4">
            <FpField lumio={lumio} label="Yangi parol" htmlFor="fp-new">
              <FpPasswordInput
                lumio={lumio}
                id="fp-new"
                autoFocus
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Kamida 6 ta belgi"
                show={showPassword}
                onToggleShow={() => setShowPassword((p) => !p)}
              />
            </FpField>
            <FpField
              lumio={lumio}
              label="Parolni takrorlang"
              htmlFor="fp-confirm"
            >
              <FpPasswordInput
                lumio={lumio}
                id="fp-confirm"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Yangi parolni qayta kiriting"
                show={showPassword}
              />
            </FpField>
            <FpSubmit lumio={lumio} loading={loading}>
              Saqlash
            </FpSubmit>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
