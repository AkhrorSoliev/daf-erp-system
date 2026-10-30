"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FolderArchive, Swords } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { MediaLesson, MediaLevelCoverage } from "./media-coverage-types";
import { SEANS_NOMLARI, kamchilik, tanlovUnitId, type Tanlov } from "./media-daraxt";

function SeansTugmasi({
  lesson,
  tanlangan,
  onTanla,
}: {
  lesson: MediaLesson;
  tanlangan: boolean;
  onTanla: (t: Tanlov) => void;
}) {
  const t = useT();
  const nom = SEANS_NOMLARI[lesson.kind];
  return (
    <button
      type="button"
      aria-current={tanlangan || undefined}
      onClick={() => onTanla({ tur: "seans", id: lesson.id })}
      className={cn(
        "block w-full truncate rounded-md px-2 py-1 text-left text-sm",
        tanlangan ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {t(nom)}
    </button>
  );
}

/** Chap ustun: daraja → unit → bo'lim → seans. */
export function MediaDaraxt({
  levels,
  tanlov,
  onTanla,
}: {
  levels: MediaLevelCoverage[];
  tanlov: Tanlov | null;
  onTanla: (t: Tanlov) => void;
}) {
  const t = useT();
  const tanlanganUnit = tanlovUnitId(levels, tanlov);
  const [ochiq, setOchiq] = React.useState<Set<number>>(() => new Set(tanlanganUnit ? [tanlanganUnit] : []));

  // Tanlov boshqa unitga o'tsa (havola, yangilash), o'sha unit ochiladi.
  React.useEffect(() => {
    if (tanlanganUnit === null) return;
    setOchiq((oldin) => (oldin.has(tanlanganUnit) ? oldin : new Set(oldin).add(tanlanganUnit)));
  }, [tanlanganUnit]);

  const almashtir = (unitId: number) =>
    setOchiq((oldin) => {
      const keyin = new Set(oldin);
      if (keyin.has(unitId)) keyin.delete(unitId);
      else keyin.add(unitId);
      return keyin;
    });

  return (
    <nav aria-label={t("Bo'limlar")} className="space-y-3 text-sm">
      {levels.map((lvl) => (
        <div key={lvl.level} className="space-y-1">
          {levels.length > 1 && <div className="px-2 text-xs font-semibold text-muted-foreground">{lvl.level}</div>}
          {lvl.units.map((u) => {
            const unitOchiq = ochiq.has(u.unitId);
            const bosh = u.sections.length === 0;
            return (
              <div key={u.unitId}>
                <button
                  type="button"
                  disabled={bosh}
                  aria-expanded={unitOchiq}
                  onClick={() => almashtir(u.unitId)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  {unitOchiq ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                  <span className="truncate font-medium">{t("{n}-unit — {title}", { n: u.order, title: u.titleUz })}</span>
                </button>
                {unitOchiq && (
                  <div className="ml-3 space-y-0.5 border-l pl-2">
                    {u.sections.map((s) => {
                      const k = kamchilik(s);
                      const tanlangan = tanlov?.tur === "bolim" && tanlov.id === s.sectionId;
                      return (
                        <div key={s.sectionId}>
                          <button
                            type="button"
                            aria-current={tanlangan || undefined}
                            onClick={() => onTanla({ tur: "bolim", id: s.sectionId })}
                            className={cn(
                              "block w-full rounded-md px-2 py-1 text-left",
                              tanlangan ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
                            )}
                          >
                            <span className="block truncate">{s.order}. {s.titleUz}</span>
                            {(k.ovoz > 0 || k.rasm > 0) && (
                              <span className="block text-xs text-amber-600 dark:text-amber-400">
                                {[
                                  k.ovoz > 0 ? t("{n} ovoz yo'q", { n: k.ovoz }) : null,
                                  k.rasm > 0 ? t("{n} rasm yo'q", { n: k.rasm }) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </button>
                          <div className="ml-2">
                            {s.lessons.map((l) => (
                              <SeansTugmasi
                                key={l.id}
                                lesson={l}
                                tanlangan={tanlov?.tur === "seans" && tanlov.id === l.id}
                                onTanla={onTanla}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {u.unitLessons.map((l) => (
                      <SeansTugmasi
                        key={l.id}
                        lesson={l}
                        tanlangan={tanlov?.tur === "seans" && tanlov.id === l.id}
                        onTanla={onTanla}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="space-y-1 border-t pt-3">
        <Link href="/media/jang" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
          <Swords className="size-4 text-muted-foreground" />
          {t("Jang savollari")}
        </Link>
        <Link href="/media/assets" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
          <FolderArchive className="size-4 text-muted-foreground" />
          {t("Media fayllari")}
        </Link>
      </div>
    </nav>
  );
}
