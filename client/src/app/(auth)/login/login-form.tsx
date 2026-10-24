"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhoneWithCodeInput } from "@/lib/format-utils";
import { useAuth } from "@/hooks/use-auth";
import { Greeting, useGreeting } from "@/components/auth/staff-greeting";
import { type PortalType } from "@/lib/portal";
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";
import { useT } from "@/i18n/context";

// SMS-based password reset — now available on every portal (login is phone-based
// across all roles). Eskiz account is active with approved template 78093; per
// Eskiz support a brand nik is not required to deliver it, so ESKIZ_FROM stays
// 4546. See memory: project_eskiz_sms_setup.
const SMS_PASSWORD_RESET_ENABLED = true;

interface LoginFormProps {
  portal: PortalType;
}

// The staff sign-in form, inside `StaffSignInShell`. Fields are the cabinet's
// own `Input` at a touch height, so the page and the panel behind it match.
export function LoginForm({ portal }: LoginFormProps) {
  const { setAuth } = useAuth();
  const t = useT();

  const [showPassword, setShowPassword] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const { greeted, greet } = useGreeting("push");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Inputda faqat raqamlar saqlanadi (bo'sh joylar — ko'rinish uchun), shuning
    // uchun serverga raqamlar HOLICHA ketadi: normalizatsiya (O'zbekiston →
    // 9 xona, chet el → kod bilan) serverda, common/utils/phone.util da.
    // Klientda kesish chet el raqamining mamlakat kodini yo'q qilardi.
    const loginValue = login.trim();

    try {
      const res = await api.post("/auth/login", { login: loginValue, password });
      setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
      // Student portal foydalanuvchilarini /portal ga yo'naltirish
      const isStudent = res.data.user?.roles?.some((r: any) => r.id === 6);
      // Awaited so `loading` stays true until the greeting replaces the form
      // (greet may first load the account's language).
      await greet(res.data.user, portal === "student" || isStudent ? "/portal" : "/");
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 403) {
        setError(
          getErrorMessage(
            err,
            t("Sizning rolingiz bu portalga kirish huquqiga ega emas"),
          ),
        );
      } else {
        setError(t("Login yoki parol noto'g'ri"));
      }
    } finally {
      setLoading(false);
    }
  }

  if (greeted) return <Greeting user={greeted} />;

  const passwordToggleLabel = showPassword
    ? t("Parolni yashirish")
    : t("Parolni ko'rsatish");

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="login">{t("Telefon raqam")}</Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
            >
              +
            </span>
            <Input
              id="login"
              type="text"
              autoComplete="username"
              required
              value={formatPhoneWithCodeInput(login)}
              onChange={(e) => setLogin(e.target.value.replace(/\D/g, ""))}
              placeholder="998 90 123 45 67"
              inputMode="tel"
              className="h-11 bg-card pl-7"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t("Parol")}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("Parolingizni kiriting")}
              className="h-11 bg-card pr-11"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={passwordToggleLabel}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{passwordToggleLabel}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={loading} className="h-11 w-full">
          {loading ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : null}
          {t("Kirish")}
        </Button>

        {SMS_PASSWORD_RESET_ENABLED ? (
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="self-center text-sm text-primary hover:underline"
          >
            {t("Parolni unutdingizmi?")}
          </button>
        ) : null}
      </form>

      <TelegramLoginButton />

      {SMS_PASSWORD_RESET_ENABLED ? (
        <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
      ) : null}
    </div>
  );
}
