"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommentList } from "@/components/shared/comment-list";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import type { RestoreLeadTarget } from "../restore-lead-dialog";
import { useArchivePanelUrl } from "./archive-panel-url";
import { useArchivedLeadDetail } from "./archive-queries";
import { ArchivedLeadInfo } from "./archived-lead-info";
import { originOf } from "./restore-lead-model";

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

/**
 * Read-only side panel of an archived lead: who phoned it, who owned it, why it
 * was archived. Open while `leadId` is set; the only action is «Tiklash».
 */
export function ArchivedLeadPanel({
  leadId,
  canRestore,
  onClose,
  onRestore,
}: {
  leadId: string;
  canRestore: boolean;
  onClose: () => void;
  onRestore: (target: RestoreLeadTarget) => void;
}) {
  const { tab, setTab } = useArchivePanelUrl();
  const query = useArchivedLeadDetail(leadId);
  const lead = query.data;
  const notFound = query.isError && statusOf(query.error) === 404;

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex flex-col overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">Arxivdagi lid</SheetTitle>
          <SheetDescription>
            Lid haqida ma&apos;lumot — bu yerda hech narsa o&apos;zgarmaydi
          </SheetDescription>
        </SheetHeader>

        {notFound ? (
          <Message text="Bu lid arxivda topilmadi" />
        ) : query.isError && !lead ? (
          <Message
            text="Lidni yuklab bo'lmadi"
            onRetry={() => query.refetch()}
          />
        ) : !lead ? (
          <div className="flex-1 space-y-4 px-6 py-5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <TabsList className="mx-6 mt-3 grid w-auto grid-cols-3">
              <TabsTrigger value="malumot">Ma&apos;lumot</TabsTrigger>
              <TabsTrigger value="izohlar">Izohlar</TabsTrigger>
              <TabsTrigger value="tarix">Tarix</TabsTrigger>
            </TabsList>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <TabsContent value="malumot" className="mt-0">
                <ArchivedLeadInfo lead={lead} />
              </TabsContent>
              <TabsContent value="izohlar" className="mt-0 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Arxivdagi lidga yangi izoh yozib bo&apos;lmaydi.
                </p>
                <CommentList entityType="Lead" entityId={lead.id} />
              </TabsContent>
              <TabsContent value="tarix" className="mt-0">
                {tab === "tarix" && (
                  <EntityHistoryTable entityType="Lead" entityId={lead.id} />
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full items-center justify-between gap-2">
            {canRestore && lead ? (
              <Button
                size="sm"
                onClick={() =>
                  onRestore({
                    id: lead.id,
                    firstName: lead.firstName,
                    lastName: lead.lastName,
                    origin: originOf(lead),
                    notes: lead.notes,
                  })
                }
              >
                <RotateCcw className="mr-2 size-4" />
                Tiklash
              </Button>
            ) : (
              <span />
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Yopish
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Message({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-5 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Qayta urinish
        </Button>
      )}
    </div>
  );
}
