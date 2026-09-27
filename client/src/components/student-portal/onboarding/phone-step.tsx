"use client";

import { useEffect, useState } from "react";
import { ChatCircleDots } from "@phosphor-icons/react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import { FpCodeInput } from "@/components/auth/forgot-password-fields";
import { Button, Field, IconTile } from "../lumio";
import type { OnboardingStatus } from "../lib/types";

// Proves the number on the card by a 4-digit SMS code. The number itself is
// not editable here: it is a sign-in key, and only staff change a student's
// phone (ADR-0031, ADR-0032).
export function PhoneStep({
  phone,
  onDone,
}: {
  phone: string;
  onDone: (status: OnboardingStatus) => void;
}) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    if (busy || cooldown > 0) return;
    setError("");
    setBusy("send");
    try {
      const res = await api.post<{ resendInSec: number }>(
        "/student-portal/onboarding/phone/send-code",
      );
      setSent(true);
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

  async function verify(e: React.FormEvent) {
    e.preventDefault();
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
      onDone(res.data);
    } catch (err) {
      setError(getErrorMessage(err, "Kod noto'g'ri yoki muddati tugagan"));
      setCode("");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={verify} className="space-y-5">
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
            <span className="whitespace-nowrap font-bold text-ink-700">
              {formatPhone(phone)}
            </span>{" "}
            raqamiga 4 xonali kod yuboramiz.
          </p>
        </div>
      </div>

      {sent ? (
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
            onClick={sendCode}
            disabled={cooldown > 0 || busy !== null}
          >
            {cooldown > 0
              ? `Qayta yuborish (${cooldown}s)`
              : "Kodni qayta yuborish"}
          </Button>
        </>
      ) : (
        <>
          {error ? <StepError message={error} /> : null}
          <Button block size="lg" onClick={sendCode} loading={busy === "send"}>
            Kod yuborish
          </Button>
        </>
      )}

      <p className="text-center text-xs font-semibold text-ink-500">
        Bu raqam sizniki emasmi yoki SMS kelmayaptimi? Administratorga murojaat
        qiling.
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
