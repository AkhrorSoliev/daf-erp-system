"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPageHeader } from "./settings-page-header";

export function GeneralSettingsClient() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Umumiy sozlamalar"
        description="Tizimning asosiy sozlamalari"
      />

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Kompaniya ma&apos;lumotlari</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Kompaniya nomi</p>
              <Input defaultValue="DaF Sprachzentrum" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Telefon raqam</p>
              <Input defaultValue="+998 71 123 45 67" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Elektron pochta</p>
              <Input defaultValue="info@daf.uz" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Manzil</p>
              <Input defaultValue="Toshkent, Chilonzor tumani" />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-sm font-medium">Tizim sozlamalari</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Standart valyuta</p>
              <Select defaultValue="uzs">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uzs">UZS (so&apos;m)</SelectItem>
                  <SelectItem value="usd">USD (dollar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Vaqt mintaqasi</p>
              <Select defaultValue="tashkent">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tashkent">Toshkent (UTC+5)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button>Saqlash</Button>
        </div>
      </div>
    </div>
  );
}
