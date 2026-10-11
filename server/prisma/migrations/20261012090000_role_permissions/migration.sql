-- ADR-0086: the CEO's per-role capability changes. Only differences from the catalog default are stored; the table starts empty, so every role keeps its access.
-- CreateTable
CREATE TABLE "RolePermission" (
    "companyId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("companyId","roleId","key")
);

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
