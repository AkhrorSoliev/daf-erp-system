"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { type AuthUser, useAuth } from "@/hooks/use-auth";
import { type PortalType, daftarScope } from "@/lib/portal";
import { DAFTAR_INPUT, DAFTAR_ROW } from "@/components/auth/daftar-field";
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";

// SMS-based password reset — now available on every portal (login is phone-based
// across all roles). Eskiz account is active with approved template 78093; per
// Eskiz support a brand nik is not required to deliver it, so ESKIZ_FROM stays
// 4546. See memory: project_eskiz_sms_setup.
const SMS_PASSWORD_RESET_ENABLED = true;

// How long the greeting stays before the cabinet opens. The session already
// exists by then; this only delays the navigation.
const GREETING_MS = 2000;
const GREETING_REDUCED_MOTION_MS = 700;

/**
 * Shown in place of the form once the sign-in has succeeded: the employee's
 * photo (their initial when there is none) and their name, written on the
 * sheet. Three rows of photo, then text rows — the sheet's row rule holds.
 */
function Greeting({ user }: { user: Pick<AuthUser, "firstName" | "photo"> }) {
  return (
    <div role="status" className="flex flex-col">
      <Avatar className="daftar-greet-photo size-24 border-2 border-primary after:hidden">
        {user.photo ? <AvatarImage src={user.photo} alt="" /> : null}
        <AvatarFallback className="bg-background text-3xl text-primary">
          {user.firstName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <p className="daftar-row daftar-greet-fade text-sm text-muted-foreground [animation-delay:0.3s]">
        Xush kelibsiz,
      </p>
      <p className="daftar-hand daftar-greet-write translate-y-2 truncate text-[2.75rem] leading-[4rem] font-medium text-primary">
        {user.firstName}
      </p>
      <p className="daftar-row daftar-greet-fade text-sm text-muted-foreground [animation-delay:1.4s]">
        Kabinet ochilmoqda…
      </p>
    </div>
  );
}

interface LoginFormProps {
  portal: PortalType;
}

// The staff sign-in form, written on a `DaftarSheet`. Every block below is a
// whole number of 2rem rows tall — that is what keeps the labels and values on
// the sheet's ruling, so size a new block the same way.
export function LoginForm({ portal }: LoginFormProps) {
  const router = useRouter();
  const { setAuth } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [greeting, setGreeting] = useState<{
    user: AuthUser;
    destination: string;
  } | null>(null);

  useEffect(() => {
    if (!greeting) return;
    router.prefetch(greeting.destination);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => router.push(greeting.destination),
      reduced ? GREETING_REDUCED_MOTION_MS : GREETING_MS,
    );
    return () => window.clearTimeout(timer);
  }, [greeting, router]);

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
      setGreeting({
        user: res.data.user,
        destination: portal === "student" || isStudent ? "/portal" : "/",
      });
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

  if (greeting) return <Greeting user={greeting.user} />;

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
