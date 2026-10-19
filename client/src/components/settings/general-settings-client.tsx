"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PhoneInput } from "@/components/ui/phone-input";
import { SettingsPageHeader } from "./settings-page-header";
import { useCan } from "@/hooks/use-permissions";
import api from "@/lib/api";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";

interface CompanyData {
  id: number;
  name: string;
  subdomain: string | null;
  logo: string | null;
  phone: string | null;
}

// The only rule on the name field, so its error is always this text.
const NAME_REQUIRED = msg("Kompaniya nomi kiritilishi shart");

interface FormValues {
  name: string;
  phone: string;
}

export function GeneralSettingsClient() {
  const t = useT();
  // The fetch runs once; a language switch must not refetch (ref copy, not a dep).
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // `PATCH /company/:id` needs `settings.company`; everyone else only reads.
  const canEdit = useCan("settings.company");

  const form = useForm<FormValues>();

  useEffect(() => {
    async function fetchCompany() {
      try {
        const companyId = localStorage.getItem("companyId");
        if (!companyId) return;
        const { data } = await api.get(`/company/${companyId}`);
        setCompany(data);
        form.reset({
          name: data.name ?? "",
          phone: data.phone ?? "",
        });
      } catch {
        toast.error(tRef.current(msg("Kompaniya ma'lumotlarini yuklashda xatolik")));
      } finally {
        setLoading(false);
      }
    }
    fetchCompany();
  }, [form]);

  async function onSubmit(values: FormValues) {
    if (!company) return;
    setSaving(true);
    try {
      const { data } = await api.patch(`/company/${company.id}`, {
        name: values.name,
        phone: values.phone || null,
      });
      setCompany(data);
      toast.success(t("Kompaniya ma'lumotlari saqlandi"));
    } catch {
      toast.error(t("Saqlashda xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title={t("Kompaniya ma'lumotlari")}
        description={t("Kompaniya nomi, telefon va boshqa asosiy ma'lumotlar")}
      />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("Kompaniya nomi")}</Label>
              <Input
                id="name"
                placeholder={t("Kompaniya nomi")}
                disabled={!canEdit}
                {...form.register("name", {
                  required: NAME_REQUIRED,
                })}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {t(NAME_REQUIRED)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">{t("Telefon raqam")}</Label>
              <Controller
                name="phone"
                control={form.control}
                render={({ field }) => (
                  <PhoneInput
                    id="phone"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!canEdit}
                  />
                )}
              />
            </div>
          </div>
        </div>

        <Separator />

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  {t("Saqlanmoqda...")}
                </>
              ) : (
                t("Saqlash")
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
