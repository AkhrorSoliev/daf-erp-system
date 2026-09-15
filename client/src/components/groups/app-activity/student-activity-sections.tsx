"use client";

import { CheckCircle2, Monitor, Radio, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DARAJA_HOLATI_NOMLARI,
  KONIKMA_NOMLARI,
  PLATFORMA_NOMLARI,
  formatDavomiylik,
  formatKunOy,
  formatSanaVaqt,
  foizRangi,
  foizUstunRangi,
} from "./activity-format";
import { KunTooltipIchi, ProgressLine } from "./activity-ui";
import type { OquvchiFaolligi, Platforma } from "./types";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ShareBar({
  label,
  soniya,
  jami,
  icon,
}: {
  label: string;
  soniya: number;
  jami: number;
  icon?: React.ReactNode;
}) {
  const pct = jami > 0 ? Math.round((soniya / jami) * 100) : 0;
  return (
    <div className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right tabular-nums">{formatDavomiylik(soniya)}</span>
    </div>
  );
}

/** Kunlik xaritadagi kvadrat rangi — chegaralar: 10/25/45 daqiqa (600/1500/2700 soniya). */
function heatClass(soniya: number): string {
  if (soniya <= 0) return "bg-muted";
  if (soniya <= 600) return "bg-primary/25";
  if (soniya <= 1500) return "bg-primary/50";
  if (soniya <= 2700) return "bg-primary/75";
  return "bg-primary";
}

const PLATFORM_ICONS: Record<Platforma, React.ReactNode> = {
  WEB: <Monitor className="size-3.5" />,
  ANDROID: <Smartphone className="size-3.5" />,
  IOS: <Smartphone className="size-3.5" />,
};

export function VaqtBolimi({ data }: { data: OquvchiFaolligi }) {
  return (
    <Section title="Ilovada vaqt">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">Faol vaqt</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{formatDavomiylik(data.vaqt.faolSoniya)}</div>
          <div className="text-xs text-muted-foreground">
            {data.shugullanganKunlar} / {data.maxraj} kun shug&apos;ullangan
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Radio className="size-3" /> Radio
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{formatDavomiylik(data.vaqt.radioSoniya)}</div>
          <div className="text-xs text-muted-foreground">faol vaqtga qo&apos;shilmaydi</div>
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <p className="text-xs font-medium text-muted-foreground">Platforma bo&apos;yicha</p>
        {(Object.keys(PLATFORMA_NOMLARI) as Platforma[]).map((p) => (
          <ShareBar
            key={p}
            label={PLATFORMA_NOMLARI[p]}
            icon={PLATFORM_ICONS[p]}
            soniya={data.vaqt.platforma[p]}
            jami={data.vaqt.faolSoniya}
          />
        ))}
      </div>
      <div className="space-y-2 pt-1">
        <p className="text-xs font-medium text-muted-foreground">Bo&apos;lim bo&apos;yicha</p>
        <ShareBar label="Ta'lim" soniya={data.vaqt.bolim.LERNEN} jami={data.vaqt.faolSoniya} />
        <ShareBar label="Boshqa" soniya={data.vaqt.bolim.OTHER} jami={data.vaqt.faolSoniya} />
      </div>
    </Section>
  );
}

export function XaritaBolimi({ data }: { data: OquvchiFaolligi }) {
  return (
    <Section title="Kunlik faollik" hint="Oxirgi 30 kun · rang — faol vaqt, nuqta — shug'ullangan kun">
      <div className="grid grid-cols-10 gap-1.5">
        {data.xarita.map((kun) => (
          <Tooltip key={kun.sana}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "relative flex aspect-square items-center justify-center rounded-md",
                  kun.kuzatilgan ? heatClass(kun.faolSoniya) : "bg-muted/40",
                )}
              >
                {kun.shugullangan && <span className="size-1.5 rounded-full bg-primary-foreground" />}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <KunTooltipIchi kun={kun} />
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatKunOy(data.xarita[0].sana)}</span>
        <span>Bugun</span>
      </div>
    </Section>
  );
}

export function MashqBolimi({ data }: { data: OquvchiFaolligi }) {
  const { mashq } = data;
  return (
    <Section
      title="Mashqlar"
      hint="To'g'ri javob — birinchi urinish bo'yicha. Qayta so'ralgandagi to'g'ri javob kirmaydi."
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">To&apos;g&apos;ri javob</div>
          <div className={cn("mt-1 text-xl font-semibold tabular-nums", foizRangi(mashq.foiz))}>
            {mashq.foiz === null ? "—" : `${mashq.foiz}%`}
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">Savollar</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{mashq.savollar}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">Xato</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{mashq.xatolar}</div>
        </div>
      </div>
      <div className="space-y-2.5 pt-1">
        <p className="text-xs font-medium text-muted-foreground">Ko&apos;nikma bo&apos;yicha</p>
        {mashq.konikmalar.map((k) => (
          <div key={k.konikma} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-3 text-sm">
            <span>
              {KONIKMA_NOMLARI[k.konikma].uz}{" "}
              <span className="text-xs text-muted-foreground">{KONIKMA_NOMLARI[k.konikma].de}</span>
            </span>
            {k.savollar === 0 ? (
              <span className="col-span-2 text-xs text-muted-foreground">Hali mashq yo&apos;q</span>
            ) : (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", foizUstunRangi(k.foiz ?? 0))}
                    style={{ width: `${k.foiz ?? 0}%` }}
                  />
                </div>
                <span className={cn("text-right tabular-nums", foizRangi(k.foiz))}>{k.foiz}%</span>
              </>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function KursBolimi({ data }: { data: OquvchiFaolligi }) {
  return (
    <Section title="Kurs progressi">
      <div className="space-y-1.5">
        {data.darajalar.map((d) => {
          const joriy = d.daraja === data.joriyDaraja.daraja;
          return (
            <div
              key={d.daraja}
              className={cn("flex items-center gap-3 rounded-md px-2 py-1.5 text-sm", joriy && "bg-primary/10")}
            >
              <Badge variant="outline">{d.daraja}</Badge>
              <span className="shrink-0 text-xs text-muted-foreground">{DARAJA_HOLATI_NOMLARI[d.holat]}</span>
              {d.holat !== "KURS_YOQ" && (
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
                    <span>
                      {d.tugatilgan}/{d.jami} dars
                    </span>
                    {d.tugatilganSana && <span>{formatKunOy(d.tugatilganSana.slice(0, 10))}</span>}
                  </div>
                  <ProgressLine value={d.tugatilgan} total={d.jami} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 pt-1 sm:grid-cols-2">
        {data.bolimlar.map((b) => (
          <div key={b.unitId} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm">
            <span className={cn("truncate", b.tugatilgan === 0 && "text-muted-foreground")}>{b.nomi}</span>
            <span className="flex shrink-0 items-center gap-1 tabular-nums text-xs">
              {b.tugatilgan === b.jami ? (
                <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400" />
              ) : (
                `${b.tugatilgan}/${b.jami}`
              )}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function SozlarBolimi({ data }: { data: OquvchiFaolligi }) {
  const { sozlar, qiyinSozlar } = data;
  const jami = sozlar.mustahkam + sozlar.organilmoqda + sozlar.yangi;
  return (
    <Section title="So&apos;zlar" hint={`Bugun takrorlash kerak: ${sozlar.bugunTakror} ta so'z`}>
      {jami === 0 ? (
        <p className="text-sm text-muted-foreground">Hali so&apos;z o&apos;rganilmagan</p>
      ) : (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="bg-green-500" style={{ width: `${(sozlar.mustahkam / jami) * 100}%` }} />
            <div className="bg-yellow-400" style={{ width: `${(sozlar.organilmoqda / jami) * 100}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-green-500" /> Mustahkam{" "}
              <b className="tabular-nums">{sozlar.mustahkam}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-yellow-400" /> O&apos;rganilmoqda{" "}
              <b className="tabular-nums">{sozlar.organilmoqda}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-muted-foreground/30" /> Yangi yoki xato{" "}
              <b className="tabular-nums">{sozlar.yangi}</b>
            </span>
          </div>
        </>
      )}
      {qiyinSozlar.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Eng ko&apos;p xato qilingan so&apos;zlar</p>
          {qiyinSozlar.map((w) => (
            <div key={w.lexemeId} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
              <span>
                <span className="font-medium">{w.de}</span>
                {w.uz && <span className="text-muted-foreground"> — {w.uz}</span>}
              </span>
              <span className="text-xs tabular-nums text-red-600 dark:text-red-400">{w.xatolar} marta xato</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function SeanslarBolimi({ data }: { data: OquvchiFaolligi }) {
  const { seanslar } = data;
  return (
    <Section title="Seanslar tarixi" hint={`Tanlangan davrda oxirgi ${seanslar.length} ta seans`}>
      {seanslar.length === 0 ? (
        <p className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">
          Bu davrda mashq qilinmagan
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {seanslar.map((s) => {
            const foizi = s.savollar === 0 ? null : Math.round((s.togri * 100) / s.savollar);
            const davomiylikSoniya = (new Date(s.tugadi).getTime() - new Date(s.boshlandi).getTime()) / 1000;
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={s.tur === "LESSON" ? "secondary" : "outline"}>
                      {s.tur === "LESSON" ? "Dars" : "Takrorlash"}
                    </Badge>
                    <span className="truncate">{s.darsNomi ?? "Takrorlash"}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatSanaVaqt(s.boshlandi)} · {formatDavomiylik(davomiylikSoniya)}
                  </div>
                </div>
                <span className={cn("shrink-0 font-medium tabular-nums", foizRangi(foizi))}>
                  {s.togri}/{s.savollar}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
