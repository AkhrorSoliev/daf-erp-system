"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/use-t";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import { useStudentProfile } from "../../lib/queries";
import type { StudentProfile } from "../../lib/types";
import { TEMA_KESH_KALITI, joriyTemaId } from "./tema-tanlash";
import { temaTop } from "./tema-reyestri";

function keshOqi(): string | null {
  try {
    return localStorage.getItem(TEMA_KESH_KALITI);
  } catch {
    return null;
  }
}

/**
 * The student's Ta'lim look (ADR-0125): the account's choice, cached on the
 * device. `tanla` changes it optimistically and puts the old look back if the
 * save fails.
 */
export function useLernenTema() {
  const t = useT();
  const qc = useQueryClient();
  const { data: profil } = useStudentProfile();
  const [kesh, setKesh] = React.useState<string | null>(null);

  React.useEffect(() => {
    setKesh(keshOqi());
  }, []);

  const id = joriyTemaId(profil ? (profil.lernenTema ?? null) : undefined, kesh);

  const tanla = React.useCallback(
    async (yangi: LernenTemaId) => {
      const eski = qc.getQueryData<StudentProfile>(["student-portal", "profile"]);
      const yoz = (v: LernenTemaId | null) => {
        qc.setQueryData<StudentProfile | undefined>(["student-portal", "profile"], (p) => (p ? { ...p, lernenTema: v } : p));
        try {
          if (v) localStorage.setItem(TEMA_KESH_KALITI, v);
          else localStorage.removeItem(TEMA_KESH_KALITI);
        } catch {
          /* cache only */
        }
        setKesh(v);
      };
      yoz(yangi);
      try {
        await api.patch("/student-portal/lernen-tema", { tema: yangi });
      } catch (e) {
        yoz((eski?.lernenTema as LernenTemaId | null | undefined) ?? null);
        toast.error(getErrorMessage(e, t("Ko'rinishni saqlab bo'lmadi, qayta urinib ko'ring")));
      }
    },
    [qc, t],
  );

  return { id, tema: temaTop(id), tanla };
}
