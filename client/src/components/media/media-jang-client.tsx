"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  RotateCcw,
  Search,
  Volume2,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useClipPlayer } from "@/components/student-portal/lernen/use-clip-player";
import {
  filtrFaolmi,
  filtrla,
  jamiSonlar,
  javobChiplari,
  topilganSon,
  type JangFilter,
} from "./media-jang-utils";
import type {
  JangAudio,
  JangKind,
  JangOverview,
  JangQuestion,
  JangStatus,
  JangUnit,
} from "./media-jang-types";

/** Jadval ustunlari: Raqam · Tur · Savol · Variantlar · Holat (md dan boshlab). */
const USTUNLAR =
  "md:grid md:grid-cols-[minmax(0,13rem)_6rem_minmax(0,1fr)_minmax(0,1.3fr)_7.5rem] md:gap-x-4";

function useKindText() {
  const t = useT();
  return (kind: JangKind) =>
    kind === "CHOOSE"
      ? t("Tanlash")
      : kind === "TYPE"
        ? t("Yozish")
        : t("Eshitish");
}

function HolatBelgisi({ status }: { status: JangStatus }) {
  const t = useT();
  return status === "APPROVED" ? (
    <Badge className="bg-emerald-100 font-normal text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
      {t("Tasdiqlangan")}
    </Badge>
  ) : (
    <Badge className="bg-amber-100 font-normal text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
      {t("Qoralama")}
    </Badge>
  );
}

/** Savol raqamini nusxalash — CEO savolni shu raqam bilan aytadi. */
function NusxaTugmasi({ matn }: { matn: string }) {
  const t = useT();
  const [nusxalandi, setNusxalandi] = useState(false);
  const taymer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (taymer.current) clearTimeout(taymer.current);
    },
    [],
  );
  async function nusxala() {
    try {
      await navigator.clipboard.writeText(matn);
      setNusxalandi(true);
      if (taymer.current) clearTimeout(taymer.current);
      taymer.current = setTimeout(() => setNusxalandi(false), 1500);
    } catch {
      // Brauzer ruxsat bermasa raqam baribir ekranda — qo'lda nusxalanadi.
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      onClick={nusxala}
      aria-label={nusxalandi ? t("Nusxalandi") : t("Nusxalash")}
      title={nusxalandi ? t("Nusxalandi") : t("Nusxalash")}
    >
      {nusxalandi ? (
        <Check className="size-3.5 text-emerald-600" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}

/**
 * Eshitish savolining ovozi. `OvozTugmasi` oraliqni (`startMs`/`endMs`)
 * o'ynay olmaydi, shuning uchun jang ekranidagi `useClipPlayer` ishlatiladi.
 */
function EshitishTugmasi({ audio }: { audio: JangAudio }) {
  const t = useT();
  const play = useClipPlayer(audio);
  return (
    <button
      type="button"
      onClick={play}
      aria-label={t("Ovozni eshitish")}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/20 active:scale-95"
    >
      <Volume2 className="size-4" />
    </button>
  );
}

function VariantlarKatagi({ q }: { q: JangQuestion }) {
  const t = useT();
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {javobChiplari(q).map((c, i) =>
          c.togri ? (
            <Badge
              key={`${c.text}-${i}`}
              className="gap-1 bg-emerald-600 font-medium text-white"
            >
              <CheckCircle2 className="size-3" />
              {c.text}
            </Badge>
          ) : (
            <Badge
              key={`${c.text}-${i}`}
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              {c.text}
            </Badge>
          ),
        )}
      </div>
      {q.akzeptiert.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("Qo'shimcha to'g'ri yozuvlar: {list}", {
            list: q.akzeptiert.join(", "),
          })}
        </p>
      )}
    </div>
  );
}

function SavolQatori({ q }: { q: JangQuestion }) {
  const kindText = useKindText();
  const t = useT();
  return (
    <li className={cn("space-y-2 border-b px-3 py-3 last:border-b-0 md:space-y-0 md:items-start", USTUNLAR)}>
      <div className="flex flex-wrap items-center gap-2 md:contents">
        <div className="flex min-w-0 items-center gap-0.5 md:order-1">
          <code className="truncate font-mono text-xs">{q.sourceId}</code>
          <NusxaTugmasi matn={q.sourceId} />
        </div>
        <div className="md:order-2">
          <Badge variant="secondary" className="font-normal">
            {kindText(q.kind)}
          </Badge>
        </div>
        <div className="md:order-5">
          <HolatBelgisi status={q.status} />
        </div>
      </div>
      <div className="flex min-w-0 items-start gap-2 md:order-3">
        {q.kind === "LISTEN" &&
          (q.audio ? (
            <EshitishTugmasi audio={q.audio} />
          ) : (
            <span className="shrink-0 text-xs text-destructive">
              {t("Ovoz yo'q")}
            </span>
          ))}
        <p className="min-w-0 text-sm [overflow-wrap:anywhere]">{q.prompt}</p>
      </div>
      <div className="min-w-0 md:order-4">
        <VariantlarKatagi q={q} />
      </div>
    </li>
  );
}

function UnitBolimi({
  unit,
  ochiq,
  onToggle,
  filtrFaol,
}: {
  unit: JangUnit;
  ochiq: boolean;
  onToggle: () => void;
  /** Filtr yoqilganda sarlavha «3 / 35» ko'rsatadi, aks holda jami son. */
  filtrFaol: boolean;
}) {
  const t = useT();
  const { counts } = unit;
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={ochiq}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition hover:bg-muted/40"
      >
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold [overflow-wrap:anywhere]">
            {unit.code} · {unit.titleUz}
          </h2>
          <p className="text-xs text-muted-foreground">
            {filtrFaol
              ? t("{shown} / {jami} ta savol", {
                  shown: unit.questions.length,
                  jami: counts.jami,
                })
              : t("{n} ta savol", { n: counts.jami })}{" "}
            ·{" "}
            {t("{choose} ta tanlash · {type} ta yozish · {listen} ta eshitish", {
              choose: counts.choose,
              type: counts.type,
              listen: counts.listen,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("{tasdiqlangan} ta tasdiqlangan · {qoralama} ta qoralama", {
              tasdiqlangan: counts.tasdiqlangan,
              qoralama: counts.qoralama,
            })}{" "}
            · {t("Fayl: {fayl}", { fayl: unit.fayl })}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 size-5 shrink-0 text-muted-foreground transition-transform",
            ochiq && "rotate-180",
          )}
        />
      </button>
      {ochiq && (
        <div className="border-t">
          <div
            className={cn(
              "hidden bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground",
              USTUNLAR,
            )}
          >
            <span>{t("Raqam")}</span>
            <span>{t("Tur")}</span>
            <span>{t("Savol")}</span>
            <span>{t("Variantlar")}</span>
            <span>{t("Holat")}</span>
          </div>
          <ul>
            {unit.questions.map((q) => (
              <SavolQatori key={q.id} q={q} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Filtrlar({
  filter,
  onChange,
}: {
  filter: JangFilter;
  onChange: (f: JangFilter) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder={t("Savol, variant, javob yoki raqam bo'yicha qidirish...")}
          aria-label={t("Savol, variant, javob yoki raqam bo'yicha qidirish...")}
          className="pl-9"
        />
      </div>
      <Select
        value={filter.kind}
        onValueChange={(v) =>
          onChange({ ...filter, kind: v as JangFilter["kind"] })
        }
      >
        <SelectTrigger className="w-full sm:w-44" aria-label={t("Tur")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{t("Barcha turlar")}</SelectItem>
          <SelectItem value="CHOOSE">{t("Tanlash")}</SelectItem>
          <SelectItem value="TYPE">{t("Yozish")}</SelectItem>
          <SelectItem value="LISTEN">{t("Eshitish")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filter.status}
        onValueChange={(v) =>
          onChange({ ...filter, status: v as JangFilter["status"] })
        }
      >
        <SelectTrigger className="w-full sm:w-48" aria-label={t("Holat")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{t("Barcha holatlar")}</SelectItem>
          <SelectItem value="DRAFT">{t("Qoralama")}</SelectItem>
          <SelectItem value="APPROVED">{t("Tasdiqlangan")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function MediaJangClient() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["media-jang"],
    queryFn: () => api.get<JangOverview>("/daf/media/jang").then((r) => r.data),
  });

  const [filter, setFilter] = useState<JangFilter>({
    search: "",
    kind: "ALL",
    status: "ALL",
  });
  // Foydalanuvchi qo'lda ochgan/yopgan unitlar; qolgani: birinchisi ochiq,
  // filtr yoqilganda mos kelgan hammasi ochiq.
  const [qolda, setQolda] = useState<Record<number, boolean>>({});

  const units = useMemo(() => data?.units ?? [], [data]);
  const korinadi = useMemo(() => filtrla(units, filter), [units, filter]);
  const jami = useMemo(() => jamiSonlar(units), [units]);
  const faol = filtrFaolmi(filter);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="space-y-1">
        <Link
          href="/media"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("Media ro'yxatiga qaytish")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("Jang savollari")}
        </h1>
      </div>

      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        {t(
          "Faqat ko'rish uchun. O'zgartirish kerak bo'lsa, savol raqamini (masalan jang-a1-u02-023) yozib yuboring.",
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>{t("Savollar olinmadi")}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="mr-1.5 size-3.5" />
              {t("Qayta urinish")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && units.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t(
              "Hali jang savollari yo'q — ular kontent fayllaridan yuklanganda shu yerda ko'rinadi.",
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && units.length > 0 && (
        <>
          <p className="text-sm font-medium">
            {t(
              "Jami {jami} ta savol · {tasdiqlangan} ta tasdiqlangan · {qoralama} ta qoralama — qoralamalar o'quvchilarga ko'rinmaydi",
              jami,
            )}
          </p>

          <Filtrlar filter={filter} onChange={setFilter} />

          {faol && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("{n} ta savol topildi", { n: topilganSon(korinadi) })}
            </p>
          )}

          {korinadi.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                {t("Hech narsa topilmadi")}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {korinadi.map((u) => {
                const asl = units.findIndex((x) => x.unitId === u.unitId);
                const ochiq = qolda[u.unitId] ?? (faol || asl === 0);
                return (
                  <UnitBolimi
                    key={u.unitId}
                    unit={u}
                    ochiq={ochiq}
                    filtrFaol={faol}
                    onToggle={() =>
                      setQolda((p) => ({ ...p, [u.unitId]: !ochiq }))
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
