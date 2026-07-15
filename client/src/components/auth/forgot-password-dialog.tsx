"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";

const RESEND_SECONDS = 60;
const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: ForgotPasswordDialogProps) {
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Parolni tiklash</DialogTitle>
          <DialogDescription>
            {step === 1 &&
              "Telefon raqamingizni kiriting — SMS orqali tasdiqlash kodi yuboramiz."}
            {step === 2 && "Tasdiqlash kodi telefon raqamingizga yuborildi."}
            {step === 3 && "Yangi parolingizni o'rnating."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleRequest} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="fp-phone" className="text-sm font-medium">
                Telefon raqam
              </label>
              <div className="flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                  +998
                </span>
                <input
                  id="fp-phone"
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  required
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))
                  }
                  placeholder="XX XXX XX XX"
                  maxLength={9}
                  className={`${inputClass} rounded-l-none`}
                />
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Kod yuborish
            </Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-1 text-center">
              <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                {formatPhone(phone)}
              </p>
              <p className="text-sm text-muted-foreground">
                Ushbu raqamga yuborilgan 4 xonali kodni kiriting.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="fp-code" className="text-sm font-medium">
                Tasdiqlash kodi
              </label>
              <input
                id="fp-code"
                type="text"
                inputMode="numeric"
                autoFocus
                required
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="••••"
                maxLength={4}
                className={`${inputClass} text-center text-lg tracking-[0.5em]`}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setCode("");
                  setError("");
                }}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                Raqamni o'zgartirish
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                {cooldown > 0 ? `Qayta yuborish (${cooldown}s)` : "Qayta yuborish"}
              </button>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Tasdiqlash
            </Button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="fp-new" className="text-sm font-medium">
                Yangi parol
              </label>
              <div className="relative">
                <input
                  id="fp-new"
                  type={showPassword ? "text" : "password"}
                  autoFocus
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Kamida 6 ta belgi"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="fp-confirm" className="text-sm font-medium">
                Parolni takrorlang
              </label>
              <input
                id="fp-confirm"
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Yangi parolni qayta kiriting"
                className={inputClass}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Saqlash
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
