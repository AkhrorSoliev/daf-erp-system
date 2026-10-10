import { BadgeCheck, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { monthShort } from "../salary-utils";
import { centerLine, mln, monthStatePill, netLabel, summaryNumbers } from "./salary-page-model";
import { SalaryToneBadge } from "./salary-tone-badge";
import type { MonthlyResponse } from "./salary-types";

interface Props {
  data: MonthlyResponse;
  /** `salary.close` — the bulk settle. */
  canClose: boolean;
  /** Unpaid payroll rows of the month, from the settle preview. */
  unpaidCount: number;
  onSettle: () => void;
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/**
 * «{Oy} oyliklari» (spec §2.2): the month state and three figures, all the
 * server's. The figures are short («10,5 mln»); the table below has the so'm.
 */
export function SalarySummaryCard({ data, canClose, unpaidCount, onSettle }: Props) {
  const s = summaryNumbers(data);
  const pill = monthStatePill(data.monthState, data.month);
  const net = netLabel(data.monthState);
  const center = centerLine(data);
  const teachers = s.teachersWorked == null ? "—" : mln(s.teachersWorked);
  const showSettle = canClose && unpaidCount > 0 && data.monthState.kind !== "OPEN";

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-2">
        <CardTitle className="text-base">{`${monthShort(data.month)} oyliklari`}</CardTitle>
        <SalaryToneBadge tone={pill.tone} className="h-auto whitespace-normal">
          {pill.text}
        </SalaryToneBadge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <Figure
              label="Ishladi"
              value={s.worked == null ? "—" : mln(s.worked)}
              sub={`ustozlar ${teachers} · xodimlar ${mln(s.staffWorked)}`}
            />
            {s.teachersWorked == null && <p className="text-xs text-amber-600">o&apos;tish oyi</p>}
          </div>
          <Figure label="Avans (oylikdan ushlanadi)" value={mln(s.advances)} sub={`${s.advanceCount} ta`} />
          <Figure
            label={net.label}
            value={mln(s.net)}
            sub={net.sub ?? `${s.teacherCount} ustoz · ${s.staffCount} xodim`}
          />
        </div>
        {center && (
          <p className="text-sm">
            shundan <b>{`markaz qo'shdi — ${mln(center.amount)}`}</b>{" "}
            <span className="text-muted-foreground">{center.note}</span>
          </p>
        )}
        {showSettle && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Hammasi bir kunda berilgan bo&apos;lsa — bir yo&apos;la belgilash. Sana va har filial kassa/karta
              summalari so&apos;raladi.
            </p>
            <Button variant="outline" className="shrink-0" onClick={onSettle}>
              <BadgeCheck data-icon="inline-start" />
              {`Oylik berilganini tasdiqlash (${unpaidCount} ta)`}
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2 text-xs text-muted-foreground">
        <CircleCheck className="size-4 shrink-0 text-green-600" />
        Umumiy ma&apos;lumotlardagi «Oyliklar» kartasi va ustozning «Mening oyligim» sahifasi — shu raqamlar
      </CardFooter>
    </Card>
  );
}
