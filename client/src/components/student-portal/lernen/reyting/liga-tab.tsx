"use client";

import * as React from "react";
import { Trophy } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { tashkentNow } from "@/lib/tashkent-time";
import { Button, Card, EmptyState, Skeleton } from "../../lumio";
import { useLiga } from "../queries";
import { haftaMatni, kotarilishMatni, otganHaftaMatni, zonadami } from "../liga";
import { ReytingJadvali, ReytingQatori } from "./reyting-jadvali";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

/** Daraja belgisining tusi — Badge tuslari kabi shaffof, ikki rejimda ham o'qiladi. */
const LIGA_TUSI = [
  "bg-amber-500/15 text-amber-600",
  "bg-ink-500/12 text-ink-700",
  "bg-amber-500/15 text-amber-600",
  "bg-coral-500/12 text-coral-600",
  "bg-sky-500/12 text-sky-600",
];

/** Yuklanish holati — daraja kartasi (88 px) va olti qator (54 px): ma'lumot kelganda sahifa sakramaydi. */
export function LigaSkelet() {
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-[88px] w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[54px] w-full" />
      ))}
    </div>
  );
}

/**
 * «Liga» tabi (spec S3 §5): daraja, hafta tugashiga qolgan kun va xona hajmi,
 * xona jadvali (o'z qatori ajratilgan, faol zonada birinchi 5 tasi yashil),
 * tepada «O'tgan hafta». Ostida «Butun markaz» — eski «Markaz» tabining
 * ro'yxati, faqat bosilganda so'raladi. Hech narsa yozmaydi.
 */
export function LigaTab() {
  const query = useLiga();
  const { data } = query;
  const [markaz, setMarkaz] = React.useState(false);

  if (loadState(query) === "loading") return <LigaSkelet />;
  if (!data) return <LoadFailed query={query} />;

  const { daraja, xona, otganHafta } = data;

  return (
    <div className="space-y-4">
      {otganHafta ? (
        <Card className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-500">
            O&apos;tgan hafta
          </p>
          <p className="font-semibold text-ink-900">{otganHaftaMatni(otganHafta, daraja)}</p>
        </Card>
      ) : null}

      <Card className="flex min-h-[88px] items-center gap-3">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full",
            LIGA_TUSI[daraja.tier] ?? LIGA_TUSI[0],
          )}
        >
          <Trophy size={26} weight="fill" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold text-ink-900">{daraja.nomi} ligasi</p>
          <p className="text-xs font-semibold text-ink-500">
            {haftaMatni(data.haftaOxiri, tashkentNow().dateStr, xona?.hajmi ?? null)}
          </p>
        </div>
      </Card>

      {xona ? (
        <div className="space-y-2">
          <p
            className={cn(
              "px-1 text-xs font-semibold",
              xona.kotarilishZonasi.faol ? "text-success" : "text-ink-500",
            )}
          >
            {kotarilishMatni(xona.kotarilishZonasi)}
          </p>
          <ul className="space-y-2" aria-label="Liga xonasi jadvali">
            {xona.qatorlar.map((q) => (
              <ReytingQatori
                key={q.studentId}
                qator={q}
                zona={zonadami(q.platz, xona.kotarilishZonasi)}
              />
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState
          icon={<Trophy size={28} weight="bold" />}
          title="Liga: birinchi seansdan keyin"
          description="Bu haftaning birinchi mashqini tugating — o'z ligangizdagi xonaga qo'shilasiz."
        />
      )}

      <Button
        variant="secondary"
        block
        aria-expanded={markaz}
        aria-controls="butun-markaz"
        onClick={() => setMarkaz((v) => !v)}
      >
        Butun markaz
      </Button>
      {markaz ? (
        <div id="butun-markaz">
          <ReytingJadvali scope="zentrum" />
        </div>
      ) : null}
    </div>
  );
}
