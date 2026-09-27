"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ChatCircleDots } from "@phosphor-icons/react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import {
  FpCodeInput,
  FpPhoneInput,
} from "@/components/auth/forgot-password-fields";
import { Button, Field, IconTile, Input } from "../lumio";
import type { OnboardingStatus } from "../lib/types";

/**
 * Proves the student's phone by a 4-digit SMS code (ADR-0039).
 *
 * First it asks whether the number on the card is theirs:
 * - «Ha» sends the code to that number;
 * - «Yo'q» takes the number they actually use, behind their current password
 *   (a sign-in key changes only with it — ADR-0031). The code goes to that
 *   number and, proved, it replaces the card's number: from then on they sign
 *   in with it.
 */
type Stage = "ask" | "other" | "code";

export function PhoneStep({
  phone,
  onDone,
}: {
  phone: string;
  onDone: (status: OnboardingStatus) => void;
}) {
  const [stage, setStage] = useState<Stage>("ask");
  // Where the last code went: the card's number, or the one the student typed.
  const [target, setTarget] = useState<"card" | "other">("card");
  const [newPhone, setNewPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(to: "card" | "other") {
    if (busy || cooldown > 0) return;
    if (to === "other") {
      if (newPhone.length !== 9) {
        setError("Telefon raqamni to'liq kiriting");
        return;
      }
      if (!password) {
        setError("Joriy parolingizni kiriting");
        return;
      }
    }
    setError("");
    setBusy("send");
    try {
      const res =
        to === "card"
          ? await api.post<{ resendInSec: number }>(
              "/student-portal/onboarding/phone/send-code",
            )
          : await api.post<{ resendInSec: number }>(
              "/student-portal/onboarding/phone/change-code",
              { phone: newPhone, currentPassword: password },
            );
      setTarget(to);
      setStage("code");
      setCode("");
      setCooldown(res.data.resendInSec);
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "SMS yuborilmadi. Birozdan keyin qayta urinib ko'ring",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    if (code.length !== 4) {
      setError("Kod 4 xonali bo'lishi kerak");
      return;
    }
    setError("");
    setBusy("verify");
    try {
      const res = await api.post<OnboardingStatus>(
        "/student-portal/onboarding/phone/verify",
        { code },
      );
      if (res.data.phone !== phone) {
        toast.success(
          `Raqamingiz yangilandi. Endi tizimga ${formatPhone(res.data.phone)} bilan kirasiz`,
          { duration: 6000 },
        );
      }
      onDone(res.data);
    } catch (err) {
      setError(getErrorMessage(err, "Kod noto'g'ri yoki muddati tugagan"));
      setCode("");
    } finally {
      setBusy(null);
    }
  }

  function backToQuestion() {
    setStage("ask");
    setCode("");
    setPassword("");
    setError("");
  }

  const sentTo = target === "card" ? phone : newPhone;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (stage === "code") void verify();
        else if (stage === "other") void send("other");
        else void send("card");
      }}
      className="space-y-5"
    >
      <div className="flex items-start gap-3">
        <IconTile
          icon={<ChatCircleDots weight="bold" />}
          tone="sky"
          size="lg"
        />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold text-ink-900">
            Telefon raqamingizni tasdiqlang
          </h2>
          <p className="mt-1 text-sm font-semibold text-ink-500">
            {stage === "code" ? (
              <>
                Kod{" "}
                <span className="whitespace-nowrap font-bold text-ink-700">
                  {formatPhone(sentTo)}
                </span>{" "}
                raqamiga yuborildi.
              </>
            ) : stage === "other" ? (
              "O'zingiz ishlatadigan raqamni kiriting — kod shu raqamga boradi."
            ) : (
              "Tizimdagi raqamingiz:"
            )}
          </p>
        </div>
      </div>

      {stage === "ask" ? (
        <>
          <div className="rounded-card bg-sunk px-4 py-3 text-center">
            <p className="font-display text-2xl font-extrabold tracking-wide text-ink-900">
              {formatPhone(phone)}
            </p>
            <p className="mt-1 text-sm font-bold text-ink-500">
              Bu sizning raqamingizmi?
            </p>
          </div>
          {error ? <StepError message={error} /> : null}
          <Button type="submit" block size="lg" loading={busy === "send"}>
            Ha, kod yuborish
          </Button>
          <Button
            variant="secondary"
            block
            disabled={busy !== null}
            onClick={() => {
              setError("");
              setStage("other");
            }}
          >
            Yo&apos;q, boshqa raqam
          </Button>
        </>
      ) : null}

      {stage === "other" ? (
        <>
          <Field label="Telefon raqamingiz">
            <FpPhoneInput lumio value={newPhone} onChange={setNewPhone} />
          </Field>
          <Field label="Joriy parolingiz">
            <Input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <p className="px-1 text-xs font-semibold text-ink-500">
            Tasdiqlangach eski raqam o&apos;rniga shu raqam yoziladi va tizimga
            u bilan kirasiz. Parol — hisobingizni begona qo&apos;ldan himoya
            qilish uchun.
          </p>
          {error ? <StepError message={error} /> : null}
          <Button type="submit" block size="lg" loading={busy === "send"}>
            Kod yuborish
          </Button>
          <Button
            variant="ghost"
            block
            disabled={busy !== null}
            onClick={backToQuestion}
          >
            Orqaga
          </Button>
        </>
      ) : null}

      {stage === "code" ? (
        <>
          <Field label="SMS kod">
            <FpCodeInput lumio value={code} onChange={setCode} />
          </Field>
          {error ? <StepError message={error} /> : null}
          <Button
            type="submit"
            block
            size="lg"
            loading={busy === "verify"}
            disabled={busy === "send"}
          >
            Tasdiqlash
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => void send(target)}
            disabled={cooldown > 0 || busy !== null}
          >
            {cooldown > 0
              ? `Qayta yuborish (${cooldown}s)`
              : "Kodni qayta yuborish"}
          </Button>
          <Button
            variant="ghost"
            block
            disabled={busy !== null}
            onClick={backToQuestion}
          >
            Orqaga
          </Button>
        </>
      ) : null}

      <p className="text-center text-xs font-semibold text-ink-500">
        SMS kelmayaptimi? Administratorga murojaat qiling.
      </p>
    </form>
  );
}

export function StepError({ message }: { message: string }) {
  return (
    <p role="alert" className="px-1 text-sm font-bold text-danger">
      {message}
    </p>
  );
}
