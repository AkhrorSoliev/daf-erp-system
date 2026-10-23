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
import { useT } from "@/i18n/context";
import {
  CODE_LENGTH,
  CODE_WRONG,
  PASSWORD_REQUIRED,
  PHONE_INCOMPLETE,
  SMS_NOT_SENT,
  portalFormError,
} from "../lib/form-error";

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
  const t = useT();
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
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send(to: "card" | "other") {
    if (busy || cooldown > 0) return;
    if (to === "other") {
      if (newPhone.length !== 9) {
        setError(PHONE_INCOMPLETE);
        return;
      }
      if (!password) {
        setError(PASSWORD_REQUIRED);
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
      setError(getErrorMessage(err, SMS_NOT_SENT));
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    if (code.length !== 4) {
      setError(CODE_LENGTH);
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
          t("Raqamingiz yangilandi. Endi tizimga {phone} bilan kirasiz", {
            phone: formatPhone(res.data.phone),
          }),
          { duration: 6000 },
        );
      }
      onDone(res.data);
    } catch (err) {
      setError(getErrorMessage(err, CODE_WRONG));
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
  // The number sits inside the sentence and is drawn bold, so the sentence is
  // split around its placeholder.
  const [sentBefore, sentAfter = ""] = t("Kod {phone} raqamiga yuborildi.").split(
    "{phone}",
  );
  const shownError = error ? portalFormError(t, error) : "";

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
            {t("Telefon raqamingizni tasdiqlang")}
          </h2>
          <p className="mt-1 text-sm font-semibold text-ink-500">
            {stage === "code" ? (
              <>
                {sentBefore}
                <span className="whitespace-nowrap font-bold text-ink-700">
                  {formatPhone(sentTo)}
                </span>
                {sentAfter}
              </>
            ) : stage === "other" ? (
              t("O'zingiz ishlatadigan raqamni kiriting — kod shu raqamga boradi.")
            ) : (
              t("Tizimdagi raqamingiz:")
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
              {t("Bu sizning raqamingizmi?")}
            </p>
          </div>
          {shownError ? <StepError message={shownError} /> : null}
          <Button type="submit" block size="lg" loading={busy === "send"}>
            {t("Ha, kod yuborish")}
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
            {t("Yo'q, boshqa raqam")}
          </Button>
        </>
      ) : null}

      {stage === "other" ? (
        <>
          <Field label={t("Telefon raqamingiz")}>
            <FpPhoneInput lumio value={newPhone} onChange={setNewPhone} />
          </Field>
          <Field label={t("Joriy parolingiz")}>
            <Input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <p className="px-1 text-xs font-semibold text-ink-500">
            {t(
              "Tasdiqlangach eski raqam o'rniga shu raqam yoziladi va tizimga u bilan kirasiz. Parol — hisobingizni begona qo'ldan himoya qilish uchun.",
            )}
          </p>
          {shownError ? <StepError message={shownError} /> : null}
          <Button type="submit" block size="lg" loading={busy === "send"}>
            {t("Kod yuborish")}
          </Button>
          <Button
            variant="ghost"
            block
            disabled={busy !== null}
            onClick={backToQuestion}
          >
            {t("Orqaga")}
          </Button>
        </>
      ) : null}

      {stage === "code" ? (
        <>
          <Field label={t("SMS kod")}>
            <FpCodeInput lumio value={code} onChange={setCode} />
          </Field>
          {shownError ? <StepError message={shownError} /> : null}
          <Button
            type="submit"
            block
            size="lg"
            loading={busy === "verify"}
            disabled={busy === "send"}
          >
            {t("Tasdiqlash")}
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => void send(target)}
            disabled={cooldown > 0 || busy !== null}
          >
            {cooldown > 0
              ? t("Qayta yuborish ({n}s)", { n: cooldown })
              : t("Kodni qayta yuborish")}
          </Button>
          <Button
            variant="ghost"
            block
            disabled={busy !== null}
            onClick={backToQuestion}
          >
            {t("Orqaga")}
          </Button>
        </>
      ) : null}

      <p className="text-center text-xs font-semibold text-ink-500">
        {t("SMS kelmayaptimi? Administratorga murojaat qiling.")}
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
