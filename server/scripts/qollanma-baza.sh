#!/usr/bin/env bash
# Qo'llanma skrinshotlari uchun lokal daf_docs bazasini noldan yig'adi.
# Faqat docker'dagi daf-postgres ichidagi daf_docs bazasiga tegadi.
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL='postgresql://daf_user:daf_password@localhost:5433/daf_docs'

docker exec daf-postgres dropdb -U daf_user --if-exists --force daf_docs
docker exec daf-postgres createdb -U daf_user daf_docs
# Migratsiyalar bo'sh bazada to'xtaydi (20260805120000 Company yozuvini kutadi).
npx prisma db push
npm run db:seed
npx ts-node --transpile-only scripts/seed-default-exit-reasons.ts
npx ts-node --transpile-only scripts/qollanma-muhit.ts
# Redis kaliti prefiksiz — daf_erp bilan aralashmasin.
docker exec daf-redis redis-cli FLUSHALL
echo "daf_docs tayyor."
