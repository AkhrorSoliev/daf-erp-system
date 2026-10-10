-- Stage notes for DaF dialogs (Uzbek): the scene a dialog opens in and a
-- per-line note such as "from another room". Optional, shown in the app.
ALTER TABLE "DafDialog" ADD COLUMN IF NOT EXISTS "sahnaUz" TEXT;
ALTER TABLE "DafDialogLine" ADD COLUMN IF NOT EXISTS "izohUz" TEXT;
