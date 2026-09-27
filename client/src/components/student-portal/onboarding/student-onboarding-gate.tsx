"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CircleNotch } from "@phosphor-icons/react";
import { Card, ProgressBar } from "../lumio";
import { LogoutButton } from "../student-logout-button";
import { loadState } from "../lib/load-state";
import { ONBOARDING_QUERY_KEY, useStudentOnboarding } from "../lib/queries";
import type { OnboardingStatus } from "../lib/types";
import { PhoneStep } from "./phone-step";
import { ProfileStep } from "./profile-step";

/**
 * The portal opens only once the student has given what ADR-0039 requires:
 * the phone proved by SMS, gender and birth date. Until then this screen
 * stands in for the whole shell — no navigation, nothing else reachable.
 *
 * FAILS OPEN on a request with no answer (offline or failed): the step is a
 * data requirement, not a security boundary, and one failed request must not
 * take the whole app away. The query keeps retrying, and the moment it
 * answers with a missing step this screen takes over.
 */
export function StudentOnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const query = useStudentOnboarding();
  const state = loadState(query);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <CircleNotch
          className="size-8 animate-spin text-coral-500"
          weight="bold"
        />
      </div>
    );
  }
  if (state === "ready" && query.data && query.data.missing.length > 0) {
    return <StudentOnboardingScreen status={query.data} />;
  }
  return <>{children}</>;
}

type Stage = "PHONE" | "PROFILE";

function stagesOf(status: OnboardingStatus): Stage[] {
  const stages: Stage[] = [];
  if (status.missing.includes("PHONE")) stages.push("PHONE");
  if (status.missing.some((s) => s !== "PHONE")) stages.push("PROFILE");
  return stages;
}

export function StudentOnboardingScreen({
  status,
}: {
  status: OnboardingStatus;
}) {
  const queryClient = useQueryClient();
  // The total is fixed when the screen opens, so "2 / 2" still reads right
  // after the first stage is done and has left `missing`.
  const [total] = useState(() => stagesOf(status).length);
  const stages = stagesOf(status);
  const current = stages[0];
  const position = total - stages.length + 1;

  function handleDone(next: OnboardingStatus) {
    queryClient.setQueryData(ONBOARDING_QUERY_KEY, next);
    // Gender and birth date also show on the profile screen.
    void queryClient.invalidateQueries({
      queryKey: ["student-portal", "profile"],
    });
    if (next.missing.length === 0) toast.success("Rahmat! Hammasi tayyor");
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 pb-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:items-center sm:pt-10">
      <div className="w-full max-w-[440px] space-y-5">
        <header className="space-y-1 px-1">
          <p className="text-sm font-bold text-ink-500">
            {total > 1 ? `${position}-qadam / ${total}` : "Bir qadam qoldi"}
          </p>
          <h1 className="font-display text-[27px] font-extrabold leading-tight text-ink-900">
            Profilingizni to&apos;ldiring
          </h1>
          <p className="text-sm font-semibold text-ink-500">
            Ilovadan foydalanishdan oldin bir necha ma&apos;lumot kerak.
          </p>
        </header>

        {total > 1 ? (
          <ProgressBar value={(position / total) * 100} height={10} />
        ) : null}

        <Card pad="lg">
          {current === "PHONE" ? (
            <PhoneStep phone={status.phone} onDone={handleDone} />
          ) : (
            <ProfileStep
              needGender={status.missing.includes("GENDER")}
              needBirthDate={status.missing.includes("BIRTH_DATE")}
              onDone={handleDone}
            />
          )}
        </Card>

        <LogoutButton />
      </div>
    </div>
  );
}
