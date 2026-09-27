"use client";

import { useState } from "react";
import {
  GenderFemale,
  GenderMale,
  IdentificationCard,
} from "@phosphor-icons/react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button, Field, IconTile, Input } from "../lumio";
import type { OnboardingStatus } from "../lib/types";
import {
  ageOn,
  birthDateBounds,
  birthDateProblem,
  localDateStr,
} from "./birth-date";
import { StepError } from "./phone-step";

type Gender = "MALE" | "FEMALE";

const GENDERS: { value: Gender; label: string; icon: React.ReactNode }[] = [
  { value: "MALE", label: "Erkak", icon: <GenderMale weight="bold" /> },
  { value: "FEMALE", label: "Ayol", icon: <GenderFemale weight="bold" /> },
];

// Gender and birth date in one step, asking only for what the card lacks. The
// server writes only empty fields, so what staff entered is never overwritten.
export function ProfileStep({
  needGender,
  needBirthDate,
  onDone,
}: {
  needGender: boolean;
  needBirthDate: boolean;
  onDone: (status: OnboardingStatus) => void;
}) {
  const [gender, setGender] = useState<Gender | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = localDateStr();
  const bounds = birthDateBounds(today);
  const age =
    needBirthDate && !birthDateProblem(birthDate, today)
      ? ageOn(birthDate, today)
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needGender && !gender) {
      setError("Jinsingizni tanlang");
      return;
    }
    if (needBirthDate) {
      const problem = birthDateProblem(birthDate, today);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.patch<OnboardingStatus>(
        "/student-portal/onboarding/profile",
        {
          ...(needGender && gender ? { gender } : {}),
          ...(needBirthDate ? { dateOfBirth: birthDate } : {}),
        },
      );
      onDone(res.data);
    } catch (err) {
      setError(getErrorMessage(err, "Saqlashda xatolik yuz berdi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-start gap-3">
        <IconTile
          icon={<IdentificationCard weight="bold" />}
          tone="grape"
          size="lg"
        />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold text-ink-900">
            O&apos;zingiz haqingizda
          </h2>
          <p className="mt-1 text-sm font-semibold text-ink-500">
            Bu ma&apos;lumotlar faqat o&apos;quv markazi uchun.
          </p>
        </div>
      </div>

      {needGender ? (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 block px-1 text-sm font-bold text-ink-700">
            Jinsingiz
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {GENDERS.map((g) => {
              const active = gender === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGender(g.value)}
                  className={cn(
                    "flex h-[60px] items-center justify-center gap-2 rounded-card border-2 font-display text-base font-bold transition-colors",
                    active
                      ? "border-coral-500 bg-coral-500/12 text-coral-700 dark:text-coral-400"
                      : "border-line bg-surface text-ink-700 hover:bg-ink-100",
                  )}
                >
                  <span className="text-xl">{g.icon}</span>
                  {g.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {needBirthDate ? (
        <Field label="Tug'ilgan sanangiz">
          <Input
            type="date"
            value={birthDate}
            min={bounds.min}
            max={bounds.max}
            onChange={(e) => setBirthDate(e.target.value)}
            required
          />
          {age !== null ? (
            <span className="block px-1 text-sm font-bold text-ink-500">
              Yoshingiz: {age}
            </span>
          ) : null}
        </Field>
      ) : null}

      {error ? <StepError message={error} /> : null}
      <Button type="submit" block size="lg" loading={busy}>
        Saqlash
      </Button>
    </form>
  );
}
