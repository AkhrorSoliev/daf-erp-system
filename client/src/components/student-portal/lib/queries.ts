"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { StudentProfile } from "./types";

// Shared profile query — one stable cache key across every screen + the shell,
// so the balance, name and photo stay in sync without duplicate fetches.
export function useStudentProfile() {
  return useQuery<StudentProfile>({
    queryKey: ["student-portal", "profile"],
    queryFn: () => api.get("/student-portal/profile").then((r) => r.data),
  });
}
