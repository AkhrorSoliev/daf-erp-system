"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightning } from "@phosphor-icons/react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog";
import { Button, Input, Field } from "@/components/student-portal/lumio";

// Lumio-styled login for the student portal (student.dafzentrum.uz). Shares the
// exact auth logic with the shared LoginForm — only the look is Lumio. Admin /
// teacher logins keep the default form.
export function StudentLoginForm() {
  const router = useRouter();
  const { setAuth } = useAuth();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Normalizatsiya serverda (common/utils/phone.util) — bu yerda kesmaymiz.
    const loginValue = login.trim();

    try {
      const res = await api.post("/auth/login", {
        login: loginValue,
        password,
      });
      setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
      router.push("/portal");
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
        setError("Telefon raqam yoki parol noto'g'ri");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-7">
      {/* Brand mark */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-coral-500 text-white clay-coral">
          <Lightning size={32} weight="fill" />
        </span>
        <div>
          <h1 className="font-display text-[28px] font-extrabold tracking-tight text-ink-900">
            Kirish
          </h1>
          <p className="mt-0.5 text-sm font-semibold text-ink-500">
            DAF Sprachzentrum — o&apos;quvchi kabineti
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : null}

        <Field label="Telefon raqam">
          <Input
            addon="+"
            type="text"
            inputMode="tel"
            autoComplete="username"
            required
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="998 90 123 45 67"
          />
        </Field>

        <Field label="Parol">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Parolingizni kiriting"
          />
        </Field>

        <Button type="submit" block size="lg" loading={loading}>
          Kirish
        </Button>

        <button
          type="button"
          onClick={() => setForgotOpen(true)}
          className="w-full text-center text-sm font-bold text-coral-600 hover:underline"
        >
          Parolni unutdingizmi?
        </button>
      </form>

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  );
}
