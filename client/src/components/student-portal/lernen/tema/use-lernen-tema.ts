"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/use-t";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import { useStudentProfile } from "../../lib/queries";
import { TEMA_KESH_KALITI, joriyTemaId } from "./tema-tanlash";
import { temaniSaqla } from "./tema-saqlash";
import { temaTop } from "./tema-reyestri";

/** Must stay equal to the key `useStudentProfile` uses. */
const PROFIL_KALITI = ["student-portal", "profile"] as const;

function keshOqi(): string | null {
  try {
    return localStorage.getItem(TEMA_KESH_KALITI);
  } catch {
    return null;
  }
}

function keshYoz(v: string | null) {
  try {
    if (v) localStorage.setItem(TEMA_KESH_KALITI, v);
    else localStorage.removeItem(TEMA_KESH_KALITI);
  } catch {
    /* cache only */
  }
}

/**
 * The student's Ta'lim look (ADR-0125): the account's choice, cached on the
 * device. `tanla` changes it optimistically and puts the old look back if the
 * save fails; one save at a time, a tap made meanwhile is ignored.
 */
export function useLernenTema() {
  const t = useT();
  const qc = useQueryClient();
  const { data: profil } = useStudentProfile();
  const [kesh, setKesh] = React.useState<string | null>(null);
  const band = React.useRef(false);

  React.useEffect(() => {
    setKesh(keshOqi());
  }, []);

  const id = joriyTemaId(profil ? (profil.lernenTema ?? null) : undefined, kesh);

  const tanla = React.useCallback(
    async (yangi: LernenTemaId) => {
      if (yangi === id) return; // tapping the look that is already chosen must not PATCH
      await temaniSaqla({
        qc,
        profilKaliti: PROFIL_KALITI,
        yangi,
        band,
        patch: (tema) => api.patch("/student-portal/lernen-tema", { tema }),
        keshOqi,
        keshYoz,
        setKesh,
        onXato: (e) => toast.error(getErrorMessage(e, t("Ko'rinishni saqlab bo'lmadi, qayta urinib ko'ring"))),
      });
    },
    [qc, t, id],
  );

  return { id, tema: temaTop(id), tanla };
}
