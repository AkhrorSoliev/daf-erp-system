"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { OutcomeBadge } from "./gateway-events-outcome-badge";
import {
  computeOutcome,
  extractPaymentInfo,
  formatAmount,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  STEP_INFO,
  type GatewayEvent,
} from "./gateway-events-helpers";

interface GatewayEventsDetailDialogProps {
  event: GatewayEvent | null;
  onClose: () => void;
}

export function GatewayEventsDetailDialog({
  event,
  onClose,
}: GatewayEventsDetailDialogProps) {
  const [payloadExpanded, setPayloadExpanded] = useState(false);

  return (
    <Dialog
      open={!!event}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setPayloadExpanded(false);
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {event &&
          (() => {
            const outcome = computeOutcome(event);
            const { amount, studentIdFromPayload } = extractPaymentInfo(event);
            const step = STEP_INFO[event.eventType];
            const studentId = event.student?.id ?? studentIdFromPayload;

            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={PROVIDER_COLORS[event.provider] ?? ""}
                    >
                      {PROVIDER_LABELS[event.provider] ?? event.provider}
                    </Badge>
                    <DialogTitle className="text-lg">
                      {step?.label ?? event.eventType}
                    </DialogTitle>
                    <OutcomeBadge outcome={outcome} />
                  </div>
                  <DialogDescription>
                    {step?.description ?? "Webhook so'rovi"}
                  </DialogDescription>
                </DialogHeader>

                {/* Asosiy ma'lumotlar */}
                <div className="grid grid-cols-2 gap-4 py-2">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Vaqt
                    </div>
                    <div className="text-sm">
                      {format(
                        new Date(event.createdAt),
                        "dd.MM.yyyy, HH:mm:ss",
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Summa
                    </div>
                    <div className="text-sm font-semibold">
                      {formatAmount(amount)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      O&apos;quvchi
                    </div>
                    <div className="text-sm">
                      {event.student ? (
                        <Link
                          href={`/students/profile/${event.student.id}`}
                          className="hover:underline hover:text-primary"
                        >
                          #{event.student.id} {event.student.firstName}{" "}
                          {event.student.lastName}
                        </Link>
                      ) : studentId ? (
                        `#${studentId}`
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Qayta ishlangan vaqt
                    </div>
                    <div className="text-sm">
                      {event.processedAt
                        ? format(
                            new Date(event.processedAt),
                            "dd.MM.yyyy, HH:mm:ss",
                          )
                        : "—"}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">
                      Tranzaksiya raqami (
                      {event.provider === "PAYME" ? "Payme" : "Click"} tizimida)
                    </div>
                    <div className="font-mono text-xs break-all bg-muted/50 px-2 py-1 rounded">
                      {event.externalId}
                    </div>
                  </div>
                </div>

                {/* Xato xabari */}
                {event.errorMessage && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3">
                    <div className="text-xs text-red-700 dark:text-red-300 font-semibold mb-1">
                      Xato xabari
                    </div>
                    <div className="text-sm text-red-900 dark:text-red-200 break-words">
                      {event.errorMessage}
                    </div>
                  </div>
                )}

                {!event.signatureValid && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-900 dark:text-red-200">
                    <strong>Diqqat:</strong> Bu so&apos;rovning xavfsizlik kaliti
                    to&apos;g&apos;ri kelmagan. Ehtimol, birovning noto&apos;g&apos;ri
                    so&apos;rovi yoki tizim sozlamalarida muammo bor.
                  </div>
                )}

                {/* Xom payload (expandable) */}
                <div className="border-t pt-3">
                  <button
                    onClick={() => setPayloadExpanded((v) => !v)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {payloadExpanded ? (
                      <ChevronUp className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                    Texnik ma&apos;lumot ({event.provider} yuborgan xom JSON)
                  </button>
                  {payloadExpanded && (
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-80 mt-2">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  )}
                </div>
              </>
            );
          })()}
      </DialogContent>
    </Dialog>
  );
}
