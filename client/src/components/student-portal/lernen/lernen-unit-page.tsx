"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  Screen,
  StackHeader,
  Stagger,
  Button,
  EmptyState,
  LoadingCards,
} from "../lumio";
import { useLernenUnit } from "./queries";
import { seansHolatlari, type SeansHolatBelgisi } from "./fortschritt";
import type { LernenSeans } from "./types";

/**
 * Seans nomi `kind`dan kelib chiqadi — MAVZU emas, A1 xaritasidagi
 * BOSQICH. `null` — eski DiB darsi, uning o'z nomi bor.
 */
function seansNomi(seans: LernenSeans): string {
  switch (seans.kind) {
    case "SECTION_A":
      return "Tanishuv";
    case "SECTION_B":
      return "Ishlatish";
    case "BRIDGE":
      return "O'tish sinovi";
    case "UNIT_TEST":
      return "Yakuniy sinov";
    default:
      return seans.titleUz ?? seans.titleDe;
  }
}

/** Holat doirachasi: bajarilgan — belgi, navbatdagi — to'ldirilgan, qulf — bo'sh. */
function SeansBelgi({ holat }: { holat: SeansHolatBelgisi }) {
  if (holat === "BAJARILGAN") {
    return (
      <CheckCircle size={26} weight="fill" className="shrink-0 text-success" />
    );
  }
  if (holat === "NAVBATDAGI") {
    return (
      <span
        aria-hidden
        className="size-[22px] shrink-0 rounded-full bg-coral-500"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="size-[22px] shrink-0 rounded-full border-2 border-line"
    />
  );
}

function SeansRow({
  seans,
  holat,
  onOpen,
}: {
  seans: LernenSeans;
  holat: SeansHolatBelgisi;
  onOpen: (id: number) => void;
}) {
  const qulf = holat === "QULF";
  return (
    <button
      type="button"
      disabled={qulf}
      onClick={() => onOpen(seans.id)}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-card border border-line bg-surface px-4 py-3.5 text-left shadow-lumio-sm transition-transform",
        qulf
          ? "opacity-60"
          : "active:translate-y-[2px] hover:-translate-y-0.5",
      )}
    >
      <SeansBelgi holat={holat} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-semibold",
          qulf ? "text-ink-400" : "text-ink-900",
        )}
      >
        {seansNomi(seans)}
      </span>
    </button>
  );
}

/**
 * Unit — bo'limlar ostida guruhlangan seanslar ro'yxati.
 *
 * Qulf butun UNIT bo'yicha hisoblanadi, bo'lim ichida emas: agar har
 * bo'lim o'z navbatini alohida hisoblasa, bir vaqtning o'zida uchta
 * seans «navbatdagi» bo'lib ko'rinardi (har bo'limda bittadan).
 */
export function LernenUnitPage({ unitId }: { unitId: number }) {
  const router = useRouter();
  const { data, isLoading, isError } = useLernenUnit(unitId);

  const holatMap = React.useMemo(() => {
    if (!data) return new Map<number, SeansHolatBelgisi>();
    const hammasi = [
      ...data.sections.flatMap((s) => s.lessons),
      ...(data.finalTest ? [data.finalTest] : []),
    ];
    const holatlar = seansHolatlari(hammasi);
    return new Map(hammasi.map((l, i) => [l.id, holatlar[i]]));
  }, [data]);

  // Eski DiB uniti: bo'lim tushunchasi umuman yo'q, shuning uchun yassi
  // ro'yxat o'z navbatini alohida hisoblaydi (butun unit emas).
  const yassiHolatMap = React.useMemo(() => {
    if (!data || data.sections.length > 0) {
      return new Map<number, SeansHolatBelgisi>();
    }
    const holatlar = seansHolatlari(data.lessons);
    return new Map(data.lessons.map((l, i) => [l.id, holatlar[i]]));
  }, [data]);

  const openLesson = (id: number) => router.push(`/portal/lernen/lessons/${id}`);

  const boshMi = data && data.sections.length === 0 && data.lessons.length === 0;

  return (
    <Screen narrow>
      <StackHeader title={data?.titleUz ?? "Bo'lim"} backHref="/portal/lernen" />

      {isLoading ? (
        <LoadingCards count={3} />
      ) : isError || !data ? (
        <EmptyState
          icon={<BookOpen size={28} weight="bold" />}
          title="Bo'limni yuklab bo'lmadi"
          description="Internet aloqasini tekshirib, qayta urinib ko'ring."
        />
      ) : boshMi ? (
        <EmptyState
          icon={<BookOpen size={28} weight="bold" />}
          title="Bu unitning mashqlari hali tayyor emas"
          description="Material tez orada qo'shiladi."
          action={
            <Button
              variant="secondary"
              onClick={() => router.push("/portal/lernen")}
            >
              Orqaga
            </Button>
          }
        />
      ) : data.sections.length > 0 ? (
        <Stagger className="space-y-5">
          <p className="px-1 text-sm font-semibold text-ink-500">
            {data.label} · {data.titleDe}
          </p>

          {data.sections.map((section) => (
            <section key={section.id} className="space-y-2">
              <div className="px-1">
                <h2 className="font-display text-base font-extrabold text-ink-900">
                  {section.order}. {section.titleUz}
                </h2>
                <p className="text-xs font-semibold text-ink-400">
                  {section.titleDe}
                </p>
              </div>
              <div className="space-y-2">
                {section.lessons.map((l) => (
                  <SeansRow
                    key={l.id}
                    seans={l}
                    holat={holatMap.get(l.id) ?? "QULF"}
                    onOpen={openLesson}
                  />
                ))}
              </div>
            </section>
          ))}

          {data.finalTest ? (
            <section className="space-y-2 border-t border-line pt-4">
              <h2 className="px-1 font-display text-base font-extrabold text-ink-900">
                Yakuniy sinov
              </h2>
              <SeansRow
                seans={data.finalTest}
                holat={holatMap.get(data.finalTest.id) ?? "QULF"}
                onOpen={openLesson}
              />
            </section>
          ) : null}
        </Stagger>
      ) : (
        // Eski DiB uniti: bo'lim yo'q, darslar guruhsiz ro'yxat.
        <Stagger className="space-y-2">
          <p className="px-1 text-sm font-semibold text-ink-500">
            {data.label} · {data.titleDe}
          </p>
          {data.lessons.map((l) => (
            <SeansRow
              key={l.id}
              seans={l}
              holat={yassiHolatMap.get(l.id) ?? "QULF"}
              onOpen={openLesson}
            />
          ))}
        </Stagger>
      )}
    </Screen>
  );
}
