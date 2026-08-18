"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  LogIn,
  Loader2,
  GraduationCap,
  Shield,
  BookOpen,
  FileText,
} from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhoneWithCodeInput } from "@/lib/format-utils";
import { useAuth } from "@/hooks/use-auth";
import { type PortalType, getPortalConfig } from "@/lib/portal";
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";

// SMS-based password reset — now available on every portal (login is phone-based
// across all roles). Eskiz account is active with approved template 78093; per
// Eskiz support a brand nik is not required to deliver it, so ESKIZ_FROM stays
// 4546. See memory: project_eskiz_sms_setup.
const SMS_PASSWORD_RESET_ENABLED = true;

const portalIcons = {
  shield: Shield,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  "file-text": FileText,
} as const;

interface LoginFormProps {
  portal: PortalType;
}

export function LoginForm({ portal }: LoginFormProps) {
  const router = useRouter();
  const { setAuth } = useAuth();
  const config = getPortalConfig(portal);
  const Icon = portalIcons[config.icon];

  const [showPassword, setShowPassword] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

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
      router.push(portal === "student" || isStudent ? "/portal" : "/");
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

  return (
    <div className="w-full max-w-sm space-y-6">
      <div>
        {portal !== "admin" && (
          <Icon className="size-8 text-primary mb-2" />
        )}
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {config.title}
        </h1>
        <p className="text-sm text-muted-foreground">{config.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="login" className="text-sm font-medium">
            Telefon raqam
          </label>
          <div className="flex">
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
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
              className="flex h-10 w-full rounded-r-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Parol
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parolingizni kiriting"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          Kirish
        </button>

        {SMS_PASSWORD_RESET_ENABLED && (
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="w-full text-center text-sm text-primary hover:underline"
          >
            Parolni unutdingizmi?
          </button>
        )}
      </form>

      <TelegramLoginButton />

      {SMS_PASSWORD_RESET_ENABLED && (
        <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
      )}
    </div>
  );
}
