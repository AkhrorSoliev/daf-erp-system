import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import type { StudentProfile } from "../../lib/types";
import { temaniSaqla } from "./tema-saqlash";

const KALIT = ["student-portal", "profile"] as const;

const profil = (lernenTema: string | null): StudentProfile => ({
  id: 10001,
  firstName: "Ali",
  lastName: "Valiyev",
  phone: null,
  extraPhone: null,
  parentPhone: null,
  parentName: null,
  telegram: null,
  photo: null,
  lernenTema,
  balance: 0,
  status: "ACTIVE",
  login: null,
  date_of_birth: null,
  address: null,
  branches: [],
  groups: [],
});

const clients: QueryClient[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.clear();
});

/** A real QueryClient, a fake in-memory device cache and a fake `kesh` state. */
function sozla(opts: { profil: StudentProfile | null; kesh: string | null }) {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  clients.push(qc);
  if (opts.profil) qc.setQueryData(KALIT, opts.profil);
  const qurilma = { v: opts.kesh };
  const holat = { v: opts.kesh };
  const band = { current: false };
  const keshYoz = vi.fn((v: string | null) => {
    qurilma.v = v;
  });
  const params = (yangi: LernenTemaId, patch: (t: LernenTemaId) => Promise<unknown>) => ({
    qc,
    profilKaliti: KALIT,
    yangi,
    band,
    patch,
    keshOqi: () => qurilma.v,
    keshYoz,
    setKesh: (v: string | null) => {
      holat.v = v;
    },
  });
  const profilTema = () => qc.getQueryData<StudentProfile>(KALIT)?.lernenTema;
  return { qc, qurilma, holat, band, keshYoz, params, profilTema };
}

describe("temaniSaqla", () => {
  it("keeps the new look in the profile and on the device when the save works", async () => {
    const s = sozla({ profil: profil("toza"), kesh: "toza" });
    const patch = vi.fn(async () => ({}));
    expect(await temaniSaqla(s.params("alp", patch))).toBe("saqlandi");
    expect(patch).toHaveBeenCalledWith("alp");
    expect(s.profilTema()).toBe("alp");
    expect(s.qurilma.v).toBe("alp");
    expect(s.holat.v).toBe("alp");
  });

  it("puts back exactly the previous profile and device values when the save fails", async () => {
    const s = sozla({ profil: profil("dengiz"), kesh: "dengiz" });
    const onXato = vi.fn();
    const natija = await temaniSaqla({ ...s.params("alp", () => Promise.reject(new Error("net"))), onXato });
    expect(natija).toBe("xato");
    expect(onXato).toHaveBeenCalledTimes(1);
    expect(s.profilTema()).toBe("dengiz");
    expect(s.qurilma.v).toBe("dengiz");
    expect(s.holat.v).toBe("dengiz");
    expect(s.band.current).toBe(false);
  });

  it("restores the previous device value, not null, when no profile was cached", async () => {
    const s = sozla({ profil: null, kesh: "dengiz" });
    const natija = await temaniSaqla(s.params("alp", () => Promise.reject(new Error("net"))));
    expect(natija).toBe("xato");
    expect(s.qc.getQueryData(KALIT)).toBeUndefined();
    expect(s.qurilma.v).toBe("dengiz");
    expect(s.holat.v).toBe("dengiz");
  });

  it("ignores a second call while the first save is pending, and the first still completes", async () => {
    const s = sozla({ profil: profil("toza"), kesh: "toza" });
    let tugat!: () => void;
    const patch = vi.fn(() => new Promise<void>((resolve) => (tugat = resolve)));
    const birinchi = temaniSaqla(s.params("alp", patch));
    const ikkinchi = await temaniSaqla(s.params("dengiz", patch));
    expect(ikkinchi).toBe("band");
    await vi.waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    tugat();
    expect(await birinchi).toBe("saqlandi");
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("alp");
    expect(s.profilTema()).toBe("alp");
    expect(s.qurilma.v).toBe("alp");
    // The guard is released: a later call goes through.
    expect(await temaniSaqla(s.params("dengiz", async () => ({})))).toBe("saqlandi");
    expect(s.profilTema()).toBe("dengiz");
  });

  it("removes the device value on failure when the device had none", async () => {
    const s = sozla({ profil: profil(null), kesh: null });
    const natija = await temaniSaqla(s.params("alp", () => Promise.reject(new Error("net"))));
    expect(natija).toBe("xato");
    expect(s.keshYoz).toHaveBeenLastCalledWith(null);
    expect(s.qurilma.v).toBeNull();
    expect(s.holat.v).toBeNull();
    expect(s.profilTema()).toBeNull();
  });

  it("an in-flight profile fetch cannot land on top of the optimistic write", async () => {
    const s = sozla({ profil: profil("toza"), kesh: "toza" });
    let kech!: (p: StudentProfile) => void;
    // A profile fetch that started before the student tapped.
    const fetchTugadi = s.qc
      .fetchQuery({ queryKey: KALIT, queryFn: () => new Promise<StudentProfile>((resolve) => (kech = resolve)), staleTime: 0 })
      .catch(() => undefined);
    await temaniSaqla(s.params("alp", async () => ({})));
    kech(profil("toza"));
    await fetchTugadi;
    expect(s.profilTema()).toBe("alp");
  });
});
