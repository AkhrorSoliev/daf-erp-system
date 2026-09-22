"use client";

import { Flame, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { ActivityError, PeriodToggle } from "./activity-ui";
import { formatOxirgiFaollik, hechQachonKirmaganmi, PLATFORMA_NOMLARI } from "./activity-format";
import {
  KursBolimi,
  MashqBolimi,
  SeanslarBolimi,
  SozlarBolimi,
  VaqtBolimi,
  XaritaBolimi,
} from "./student-activity-sections";
import type { Davr, OquvchiFaolligi } from "./types";
import { useOquvchiFaolligi } from "./use-app-activity";

export function oxirgiFaollikMatni(data: OquvchiFaolligi): string {
  const matn = formatOxirgiFaollik(data.oxirgiFaollik?.vaqt ?? null, new Date());
  return data.oxirgiFaollik ? `${matn} · ${PLATFORMA_NOMLARI[data.oxirgiFaollik.platforma]}` : matn;
}

export function StudentActivityPanel({
  url,
  davr,
  onDavrChange,
  renderHeader,
  bodyClassName,
}: {
  url: string;
  davr: Davr;
  onDavrChange: (d: Davr) => void;
  /** Sheet o'z sarlavhasini chizadi (`data` yuklanmagan paytda ham); profil sahifasida `null`. */
  renderHeader: ((data: OquvchiFaolligi | undefined, meta: React.ReactNode) => React.ReactNode) | null;
  bodyClassName?: string;
}) {
  const { data, isLoading, isError, refetch } = useOquvchiFaolligi(url, davr);

  const meta = data && (
    <div className="flex flex-wrap gap-2 pt-2">
      <Badge variant="secondary" className="gap-1">
        <Sparkles /> {data.joriyDaraja.daraja} · {data.fortschritt.stufe.uz}
      </Badge>
      <Badge variant="secondary" className="gap-1">
        <Trophy /> {formatNumber(data.fortschritt.gesamt)} ball
      </Badge>
      <Badge variant="secondary" className="gap-1">
        <Flame /> {data.fortschritt.serie} kun seriya
      </Badge>
    </div>
  );

  return (
    <>
      {renderHeader?.(data, meta)}
      <div className={cn("space-y-7", bodyClassName)}>
        {isLoading ? (
          <PanelSkeleton />
        ) : isError || !data ? (
          <ActivityError onRetry={() => void refetch()} />
        ) : (
          <PanelTanasi data={data} davr={davr} onDavrChange={onDavrChange} sarlavhaYoq={renderHeader === null} meta={meta} />
        )}
      </div>
    </>
  );
}

function PanelTanasi({
  data,
  davr,
  onDavrChange,
  sarlavhaYoq,
  meta,
}: {
  data: OquvchiFaolligi;
  davr: Davr;
  onDavrChange: (d: Davr) => void;
  sarlavhaYoq: boolean;
  meta: React.ReactNode;
}) {
  return (
    <>
      {sarlavhaYoq && (
        <div>
          <p className="text-sm text-muted-foreground">Oxirgi faollik: {oxirgiFaollikMatni(data)}</p>
          {meta}
        </div>
      )}
      {!data.akkaunt ? (
        <BoshHolat sarlavha="Akkaunt yo'q" matn="O'quvchiga ilova akkaunti ochilmagan — faollikni o'lchab bo'lmaydi." />
      ) : (
        <>
          {/* Davr tanlovi akkaunti bor har bir o'quvchi uchun doim ko'rinadi
              (topilma 2) — aks holda foydalanuvchi ma'lumot yo'q davrda
              qolib ketadi va bosh sarlavhadagi ball/seriya bilan ziddiyat
              chiqadi. */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Davr</span>
            <PeriodToggle value={davr} onChange={onDavrChange} />
          </div>
          {hechQachonKirmaganmi(data) ? (
            <BoshHolat
              sarlavha="O'quvchi ilovaga hali kirmagan"
              matn="Na vebdan, na telefondan kirish qayd etilmagan. Ota-onasi yoki o'quvchining o'zi bilan gaplashib ko'rish mumkin."
            />
          ) : (
            <>
              <VaqtBolimi data={data} />
              <XaritaBolimi data={data} />
              <MashqBolimi data={data} />
              <KursBolimi data={data} />
              <SozlarBolimi data={data} />
              <SeanslarBolimi data={data} />
            </>
          )}
        </>
      )}
    </>
  );
}

function BoshHolat({ sarlavha, matn }: { sarlavha: string; matn: string }) {
  return (
    <div className="rounded-xl border px-4 py-8 text-center">
      <p className="font-medium">{sarlavha}</p>
      <p className="mt-1 text-sm text-muted-foreground">{matn}</p>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-5 w-64" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </>
  );
}
