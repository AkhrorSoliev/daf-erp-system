"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhoneWithCodeInput } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Greeting, useGreeting } from "@/components/auth/daftar-greeting";
import { type PortalType, daftarScope } from "@/lib/portal";
import { DAFTAR_INPUT, DAFTAR_ROW } from "@/components/auth/daftar-field";
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";

// SMS-based password reset — now available on every portal (login is phone-based
// across all roles). Eskiz account is active with approved template 78093; per
// Eskiz support a brand nik is not required to deliver it, so ESKIZ_FROM stays
// 4546. See memory: project_eskiz_sms_setup.
const SMS_PASSWORD_RESET_ENABLED = true;

interface LoginFormProps {
  portal: PortalType;
}

// The staff sign-in form, written on a `DaftarSheet`. Every block below is a
// whole number of 2rem rows tall — that is what keeps the labels and values on
// the sheet's ruling, so size a new block the same way.
export function LoginForm({ portal }: LoginFormProps) {
  const { setAuth } = useAuth();

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
      greet(res.data.user, portal === "student" || isStudent ? "/portal" : "/");
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 403) {
        setError(
          getErrorMessage(
            err,
            "Sizning rolingiz bu portalga kirish huquqiga ega emas",
          ),
        );
      } else {
        setError("Login yoki parol noto'g'ri");
      }
    } finally {
      setLoading(false);
    }
  }

  if (greeted) return <Greeting user={greeted} />;

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col">
        {/* The teacher's red pen: a correction written above the fields. */}
        {error ? (
          <p
            role="alert"
            className="daftar-row daftar-hand text-lg text-destructive"
          >
            {error}
          </p>
        ) : null}

        <label
          htmlFor="login"
          className="daftar-row text-sm text-muted-foreground"
        >
          Telefon raqam
        </label>
        <div className={cn(DAFTAR_ROW, "h-8")}>
          <span aria-hidden="true" className="text-base text-muted-foreground">
            +
          </span>
          <input
            id="login"
            type="text"
            autoComplete="username"
            required
            value={formatPhoneWithCodeInput(login)}
            onChange={(e) => setLogin(e.target.value.replace(/\D/g, ""))}
            placeholder="998 90 123 45 67"
            inputMode="tel"
            className={cn(DAFTAR_INPUT, "pt-2")}
          />
        </div>

        <label
          htmlFor="password"
          className="daftar-row text-sm text-muted-foreground"
        >
          Parol
        </label>
        <div className={cn(DAFTAR_ROW, "h-8")}>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Parolingizni kiriting"
            className={cn(DAFTAR_INPUT, "pt-2")}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"
                }
                className="self-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* One empty row, then the button centred in two: 2.5 + 3 + 0.5rem. */}
        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="mt-10 mb-2 h-12 w-full"
        >
          {loading ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : null}
          Kirish
        </Button>

        {SMS_PASSWORD_RESET_ENABLED ? (
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="daftar-row text-center text-sm text-primary hover:underline"
          >
            Parolni unutdingizmi?
          </button>
        ) : null}
      </form>

      <TelegramLoginButton />

      {SMS_PASSWORD_RESET_ENABLED ? (
        <ForgotPasswordDialog
          open={forgotOpen}
          onOpenChange={setForgotOpen}
          contentClassName={daftarScope(portal)}
        />
      ) : null}
    </>
  );
}
