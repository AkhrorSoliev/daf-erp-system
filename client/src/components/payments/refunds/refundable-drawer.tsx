"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone, Send } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { formatBalance, formatPhone, formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Can } from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";
import { cn } from "@/lib/utils";
import { instantDayMonth } from "../debt/debt-format";
import { drawerKindLine, noticeText } from "./refunds-format";
import { invalidateRefunds, useRefundableStudent } from "./refunds-queries";
import { TransferNote } from "./transfer-note";
import type { DrawerStudent, RefundableDrawer as DrawerData } from "./refunds-types";

/** What a drawer option opens (spec §3.5). The page closes the drawer first, then opens the dialog. */
export type DrawerAction = "return" | "enroll" | "refund" | "transfer";

/** The capability each option needs: the one its server route checks. */
const OPTION_KEYS: Record<DrawerAction | "notice", PermissionKey> = {
  return: "students.manage", // PATCH /students/:id/status
  enroll: "students.enroll", // POST /students/:id/enroll
  refund: "refunds.create", // POST /refunds/quick
  notice: "balance.withdraw", // POST /students/:id/balance-notices
  transfer: "balance.withdraw", // POST /withdrawals
};

/** Row click on «Qaytariladigan pul» (spec §3.5). Each option needs its own capability: a cashier reads the facts only. */
export function RefundableDrawer({ studentId, can, onClose, onAction }: {
  studentId: number | null; can: Can; onClose: () => void; onAction: (kind: DrawerAction, student: DrawerStudent) => void;
}) {
  const { data, isPending, isError, error } = useRefundableStudent(studentId);
  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          {/* pr-8 keeps the name clear of the sheet's own close button. */}
          <div className="min-w-0 pr-8">
            <SheetTitle className="truncate">{data ? `${data.student.firstName} ${data.student.lastName}` : "O'quvchi"}</SheetTitle>
            <SheetDescription>{data ? `ID ${data.student.id} · ${formatPhone(data.student.phone)}` : "Yuklanmoqda…"}</SheetDescription>
          </div>
        </SheetHeader>
        {isError ? (
          // Another branch's student: the server names the branch to switch to (ADR-0063).
          <p className="p-6 text-sm text-muted-foreground">{getErrorMessage(error, "Ma'lumotni yuklab bo'lmadi")}</p>
        ) : isPending || !data ? (
          <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <RefundableDrawerBody key={data.student.id} drawer={data} can={can} onAction={(kind) => onAction(kind, data.student)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right">{children}</span>
  </div>
);

const Option = ({ title, hint, locked = false, children }: { title: string; hint: string; locked?: boolean; children: ReactNode }) => (
  <div className={cn("space-y-2 rounded-lg border p-3", locked && "bg-muted/40")}>
    <p className="font-medium">{title}</p>
    <p className="text-xs text-muted-foreground">{hint}</p>
    {children}
  </div>
);

export function RefundableDrawerBody({ drawer: d, can, onAction }: {
  drawer: DrawerData; can: Can; onAction: (kind: DrawerAction) => void;
}) {
  const may = (option: DrawerAction | "notice") => can(OPTION_KEYS[option]);
  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4 text-sm">
      <div className="rounded-lg bg-muted/50 px-4 py-3">
        <p className="text-xs text-muted-foreground">Markazdagi puli</p>
        <p className="text-2xl font-bold tabular-nums">{formatBalance(d.balance)}</p>
      </div>
      <div>
        <Fact label="Holat">{drawerKindLine(d)}</Fact>
        <Fact label="Oxirgi guruh">{d.lastGroup?.name ?? "—"}</Fact>
        <Fact label="Oxirgi to'lov">{d.lastPayment ? `${instantDayMonth(d.lastPayment.createdAt)} · ${formatPrice(d.lastPayment.amount)}` : "—"}</Fact>
        <Fact label="Telegram bot">{d.telegramLinked ? "ulangan" : "ulanmagan"}</Fact>
        <Fact label="Xabar">{noticeText(d.transfer.notice)}</Fact>
      </div>
      {can(Object.values(OPTION_KEYS)) && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Nima qilish mumkin</h3>
          {d.kind === "muzlatilgan" && may("return") && (
            <Option title="Qaytdi — guruhga qaytarish" hint="Pul oyning qolgan darslari hisobiga o'tadi.">
              <Button size="sm" variant="outline" onClick={() => onAction("return")}>Qaytarish</Button>
            </Option>
          )}
          {d.kind === "guruhsiz" && may("enroll") && (
            <Option title="Guruhga qo'shish" hint="Pul shu oyning qolgan darslari hisobiga o'tadi.">
              <Button size="sm" variant="outline" onClick={() => onAction("enroll")}>Guruh tanlash</Button>
            </Option>
          )}
          {may("refund") && (
            <Option title="Pulni o'quvchiga qaytarish" hint="So'rov ochiladi: balans 0 bo'ladi, pul 10 bank kuni ichida beriladi.">
              <Button size="sm" variant="outline" onClick={() => onAction("refund")}>Qaytarishni boshlash</Button>
            </Option>
          )}
          {may("notice") && <NoticeOption drawer={d} />}
          {may("transfer") && (
            <Option title="Markaz hisobiga o'tkazish" hint="Pul markaz daromadiga o'tadi. Sabab yoziladi." locked={!d.transfer.allowed}>
              <TransferNote transfer={d.transfer} />
              <Button size="sm" variant="destructive" disabled={!d.transfer.allowed} onClick={() => onAction("transfer")}>O'tkazish</Button>
            </Option>
          )}
        </section>
      )}
    </div>
  );
}

/** «Xabar berish» (spec §5.1): the bot text exactly as the server would send it, or a call mark. The notice starts the transfer clock. */
function NoticeOption({ drawer: d }: { drawer: DrawerData }) {
  const qc = useQueryClient();
  const [callOpen, setCallOpen] = useState(false);
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: (channel: "BOT" | "CALL") =>
      api.post(`/students/${d.student.id}/balance-notices`, { channel, note: channel === "CALL" ? note.trim() || undefined : undefined }),
    onSuccess: (_answer, channel) => {
      toast.success(channel === "BOT" ? "Xabar botga yuborildi" : "Qo'ng'iroq belgilandi");
      setCallOpen(false);
      setNote("");
      invalidateRefunds(qc);
    },
    // A refusal («Botga xabar yetmadi», «O'quvchi hisobida pul yo'q») may mean the facts moved: read them again.
    onError: (e) => {
      toast.error(getErrorMessage(e, "Xabarni saqlashda xatolik"));
      invalidateRefunds(qc);
    },
  });
  return (
    <Option title="Xabar berish" hint="«Pulingizni olib keting» — markazga o'tkazishdan oldin kamida bir marta.">
      {/* Plain text from the server (line breaks, emoji): printed as text, never as HTML. */}
      {d.telegramLinked && d.noticePreview && <p className="whitespace-pre-line rounded-md bg-muted px-3 py-2 text-xs">{d.noticePreview}</p>}
      {callOpen ? (
        <div className="flex flex-wrap gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Izoh (ixtiyoriy)" maxLength={500} aria-label="Izoh" className="min-w-0 flex-1" />
          <Button size="sm" onClick={() => send.mutate("CALL")} disabled={send.isPending}>
            {send.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}Saqlash
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setCallOpen(false); setNote(""); }} disabled={send.isPending}>Bekor qilish</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {d.telegramLinked && (
            <Button size="sm" variant="outline" disabled={!d.noticePreview || send.isPending} onClick={() => send.mutate("BOT")}>
              {send.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Send className="mr-1 size-4" />}Botga xabar yuborish
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setCallOpen(true)}><Phone className="mr-1 size-4" />Qo'ng'iroq qilib aytildi</Button>
        </div>
      )}
      {!d.telegramLinked && <p className="text-xs text-muted-foreground">Bot ulanmagan — qo'ng'iroq qiling va belgilang.</p>}
      {d.telegramLinked && !d.noticePreview && <p className="text-xs text-muted-foreground">Filial telefon raqami kiritilmagan</p>}
    </Option>
  );
}
