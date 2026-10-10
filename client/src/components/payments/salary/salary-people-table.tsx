import type { KeyboardEvent } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPrice } from "@/lib/format-utils";
import { SalaryInactiveBadge } from "../salary-inactive-badge";
import { rowStatus, type PersonRow } from "./salary-page-model";
import { SalaryToneBadge } from "./salary-tone-badge";
import type { MonthStateKind } from "./salary-types";

interface Props {
  /** Teachers first, then staff (`mergePeople`), already filtered by the segment. */
  rows: PersonRow[];
  state: MonthStateKind;
  loading: boolean;
  onOpenRow: (userId: number) => void;
}

const COLUMNS = 7;

const Muted = ({ children }: { children: string }) => <span className="text-muted-foreground">{children}</span>;

/**
 * One table for teachers and staff (spec §2.4). Every person of the month, so
 * not paginated; a row opens the person's drawer in any month state.
 */
export function SalaryPeopleTable({ rows, state, loading, onOpenRow }: Props) {
  const onKey = (e: KeyboardEvent, userId: number) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onOpenRow(userId);
  };
  // A row without lesson data has no «Ishladi» figure, so neither has the total (as in the summary).
  const worked = rows.some((r) => r.worked == null) ? null : rows.reduce((t, r) => t + (r.worked ?? 0), 0);
  const advances = rows.reduce((t, r) => t + r.advances, 0);
  const net = rows.reduce((t, r) => t + r.net, 0);

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>Xodim</TableHead>
            <TableHead>Nimadan</TableHead>
            <TableHead className="text-right">Ishladi</TableHead>
            <TableHead className="text-right">Avans</TableHead>
            <TableHead className="text-right">Beriladi</TableHead>
            <TableHead>Holat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 6 }, (_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={COLUMNS}>
                  <Skeleton className="h-9 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMNS} className="py-10 text-center text-sm text-muted-foreground">
                Bu oyda hech kim topilmadi — oyni yoki qidiruvni o&apos;zgartirib ko&apos;ring.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => {
              const status = rowStatus(r.payment, state);
              return (
                <TableRow
                  key={`${r.kind}-${r.userId}`}
                  tabIndex={0}
                  className="cursor-pointer outline-none focus-visible:bg-muted"
                  onClick={() => onOpenRow(r.userId)}
                  onKeyDown={(e) => onKey(e, r.userId)}
                >
                  <TableCell className="border-r text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {r.role}
                      {!r.isActive && <SalaryInactiveBadge />}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.from}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.worked == null ? <Muted>—</Muted> : formatPrice(r.worked)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.advances > 0 ? formatPrice(r.advances) : <Muted>0</Muted>}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatPrice(r.net)}</TableCell>
                  <TableCell>
                    <SalaryToneBadge tone={status.tone}>{status.text}</SalaryToneBadge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
        {!loading && rows.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell className="border-r" />
              <TableCell colSpan={2} className="font-semibold">{`Jami · ${rows.length} kishi`}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {worked == null ? <Muted>—</Muted> : formatPrice(worked)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatPrice(advances)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatPrice(net)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
