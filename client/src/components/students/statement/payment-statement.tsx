"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import {
  CorrectPaymentDialog,
  type CorrectablePayment,
} from "../correct-payment-dialog";
import { StatementLedger } from "./statement-ledger";
import { StatementReport } from "./statement-report";
import type { StatementResponse } from "./statement-types";
import { asOfText, statementPdfName } from "./statement-utils";

/**
 * The To'lovlar tab: the payment statement (ADR-0037) with its PDF, and the
 * raw ledger under "Barcha yozuvlar". Roles 1-3 only, like the tab itself;
 * the server checks the role and the student's branch.
 */
export function PaymentStatement({
  studentId,
  onCorrected,
}: {
  studentId: number;
  /** A payment was corrected: the student's balance changed. */
  onCorrected?: (newBalance: number | null) => void;
}) {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const canCorrect =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const [data, setData] = useState<StatementResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [correctTarget, setCorrectTarget] = useState<CorrectablePayment | null>(
    null,
  );
  // Read once per load: the 72-hour rule is judged against the moment the
  // statement arrived, not re-evaluated on every render.
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<StatementResponse>(`/students/${studentId}/statement`)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setFailed(false);
        setLoadedAt(Date.now());
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, refreshKey]);

  const retry = useCallback(() => {
    setFailed(false);
    setData(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const downloadPdf = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await downloadAuthedFile(
        `/students/${studentId}/statement.pdf`,
        statementPdfName(studentId, data.model.asOf),
      );
    } catch {
      toast.error("PDF yuklab olishda xatolik");
    } finally {
      setDownloading(false);
    }
  };

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-10 text-center">
        <p className="text-sm text-muted-foreground">
          To&apos;lovlar hisobotini yuklab bo&apos;lmadi
        </p>
        <Button variant="outline" size="sm" onClick={retry}>
          Qayta urinish
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {data.view.title}
          <span className="font-normal text-muted-foreground">
            {" · "}
            {asOfText(data.view.asOfLine)}
          </span>
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadPdf}
          disabled={downloading}
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          PDF yuklab olish
        </Button>
      </header>

      <StatementReport
        data={data}
        who={{ isCeo, canCorrect }}
        now={loadedAt}
        onCorrect={setCorrectTarget}
      />

      <StatementLedger studentId={studentId} refreshKey={refreshKey} />

      <CorrectPaymentDialog
        open={correctTarget !== null}
        onOpenChange={(o) => {
          if (!o) setCorrectTarget(null);
        }}
        payment={correctTarget}
        onCorrected={(newBalance) => {
          setCorrectTarget(null);
          setRefreshKey((k) => k + 1);
          onCorrected?.(newBalance);
        }}
      />
    </div>
  );
}
