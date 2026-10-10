"use client";

import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CUSTOMER_KINDS,
  CUSTOMER_KIND_LABEL,
  dateValue,
  dayString,
  type CustomerDraft,
} from "./contract-rules";
import type { CustomerKind } from "./contract-types";

interface Props {
  value: CustomerDraft;
  onChange: (next: CustomerDraft) => void;
  onKindChange: (kind: CustomerKind) => void;
  minor: boolean | null;
}

export function ContractCustomerFields({ value, onChange, onKindChange, minor }: Props) {
  const self = value.kind === "SELF";
  const set = <K extends keyof CustomerDraft>(key: K, v: CustomerDraft[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Buyurtmachi</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Buyurtmachi kim</Label>
          <Select value={value.kind} onValueChange={(v) => onKindChange(v as CustomerKind)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOMER_KINDS.map((k) => (
                <SelectItem key={k} value={k} disabled={k === "SELF" && minor === true}>
                  {CUSTOMER_KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {minor === true && (
            <p className="text-xs text-muted-foreground">
              O&apos;quvchi 18 yoshdan kichik — Buyurtmachi ota-ona yoki vasiy bo&apos;ladi.
            </p>
          )}
        </div>

        {value.kind === "OTHER" && (
          <div className="space-y-1.5">
            <Label htmlFor="contract-kind-other">Vakillik asosi</Label>
            <Input
              id="contract-kind-other"
              value={value.kindOther}
              onChange={(e) => set("kindOther", e.target.value)}
              maxLength={100}
            />
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="contract-full-name">F.I.O.</Label>
          <Input
            id="contract-full-name"
            value={value.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            disabled={self}
            maxLength={150}
          />
        </div>

        {!self && (
          <div className="space-y-1.5">
            <Label>Tug&apos;ilgan sana</Label>
            <DatePicker
              value={dateValue(value.birthDate)}
              onChange={(d) => set("birthDate", dayString(d))}
              maxDate={new Date()}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="contract-passport">Pasport / ID seriya, raqami</Label>
          <Input
            id="contract-passport"
            value={value.passport}
            onChange={(e) => set("passport", e.target.value)}
            maxLength={30}
            placeholder="AB 1234567"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="contract-address">Yashash manzili</Label>
          <Input
            id="contract-address"
            value={value.address}
            onChange={(e) => set("address", e.target.value)}
            maxLength={300}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Telefon</Label>
          <PhoneInput value={value.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contract-telegram">Telegram</Label>
          <Input
            id="contract-telegram"
            value={value.telegram}
            onChange={(e) => set("telegram", e.target.value)}
            maxLength={64}
            placeholder="@ism"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="contract-email">E-mail</Label>
          <Input
            id="contract-email"
            type="email"
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
            maxLength={120}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Bo&apos;sh qoldirilgan joy shartnomada chiziq bo&apos;lib chiqadi va qog&apos;ozda qo&apos;lda
        yoziladi.
      </p>
    </section>
  );
}
