import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import type { StudentProfile } from "../../lib/types";

export interface TemaSaqlashParams {
  qc: QueryClient;
  /** The cache key of the student profile. */
  profilKaliti: QueryKey;
  yangi: LernenTemaId;
  /** At most one save at a time; the hook keeps this in a ref. */
  band: { current: boolean };
  patch: (tema: LernenTemaId) => Promise<unknown>;
  /** The device cache: the stored string, or null when there is none. */
  keshOqi: () => string | null;
  /** Writes the device cache; null removes it. */
  keshYoz: (v: string | null) => void;
  setKesh: (v: string | null) => void;
  /** Called after the old look is back, with the error of the failed save. */
  onXato?: (e: unknown) => void;
}

/**
 * Saves the student's look optimistically. On failure it puts back exactly what
 * was there before this call (profile, device cache, state), never a default.
 * A call made while a save is pending does nothing.
 */
export async function temaniSaqla(p: TemaSaqlashParams): Promise<"saqlandi" | "xato" | "band"> {
  const { qc, profilKaliti } = p;
  if (p.band.current) return "band";
  p.band.current = true;
  try {
    // A profile fetch that started earlier must not land on top of the write.
    await qc.cancelQueries({ queryKey: profilKaliti });
    const eskiProfil = qc.getQueryData<StudentProfile>(profilKaliti);
    const eskiKesh = p.keshOqi();

    qc.setQueryData<StudentProfile | undefined>(profilKaliti, (x) => (x ? { ...x, lernenTema: p.yangi } : x));
    p.keshYoz(p.yangi);
    p.setKesh(p.yangi);
    try {
      await p.patch(p.yangi);
      return "saqlandi";
    } catch (e) {
      if (eskiProfil) {
        qc.setQueryData<StudentProfile | undefined>(profilKaliti, (x) => (x ? { ...x, lernenTema: eskiProfil.lernenTema } : x));
      }
      p.keshYoz(eskiKesh);
      p.setKesh(eskiKesh);
      p.onXato?.(e);
      return "xato";
    }
  } finally {
    p.band.current = false;
  }
}
