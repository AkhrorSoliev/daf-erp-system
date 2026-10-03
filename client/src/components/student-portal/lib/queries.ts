"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  ExtraPhoneStatus,
  OnboardingStatus,
  StudentProfile,
} from "./types";

// Shared profile query — one stable cache key across every screen + the shell,
// so the balance, name and photo stay in sync without duplicate fetches.
export function useStudentProfile() {
  return useQuery<StudentProfile>({
    queryKey: ["student-portal", "profile"],
    queryFn: () => api.get("/student-portal/profile").then((r) => r.data),
  });
}

export const ONBOARDING_QUERY_KEY = ["student-portal", "onboarding"] as const;

// What the student still owes before the portal opens (ADR-0039). The shell
// gates on it; each onboarding write returns the new status, which goes
// straight into this cache.
export function useStudentOnboarding() {
  return useQuery<OnboardingStatus>({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: () => api.get("/student-portal/onboarding").then((r) => r.data),
    // The gate shows a spinner until this answers and fails open on an error;
    // the default three retries would hold the spinner for ~7 s first.
    retry: 1,
  });
}

export const EXTRA_PHONE_QUERY_KEY = ["student-portal", "extra-phone"] as const;

// The backup number and whether the student may change it (ADR-0067). Each
// write answers with the new status, which goes straight into this cache.
export function useExtraPhone() {
  return useQuery<ExtraPhoneStatus>({
    queryKey: EXTRA_PHONE_QUERY_KEY,
    queryFn: () => api.get("/student-portal/extra-phone").then((r) => r.data),
  });
}
