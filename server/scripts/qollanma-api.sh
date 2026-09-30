#!/usr/bin/env bash
# API'ni daf_docs bilan ishga tushiradi, tashqi xizmatlarsiz.
# Bot tokeni bo'sh bo'lmasa Telegraf deleteWebhook chaqirib haqiqiy bot webhook'ini buzadi.
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL='postgresql://daf_user:daf_password@localhost:5433/daf_docs'
# daf_docs faqat soxta ma'lumot — lokal imzo kaliti yetarli, .env shart emas.
export JWT_SECRET='qollanma-lokal-imzo-kaliti'
export CRONS_ENABLED=false
export TELEGRAM_BOT_TOKEN='' TELEGRAM_ADMIN_BOT_TOKEN='' TELEGRAM_MINI_APP_URL=''
export ESKIZ_EMAIL='' ESKIZ_PASSWORD='' ESKIZ_FROM=''
export VAPID_PUBLIC_KEY='' VAPID_PRIVATE_KEY='' VAPID_EMAIL=''
export R2_ACCOUNT_ID='' R2_ACCESS_KEY_ID='' R2_SECRET_ACCESS_KEY='' R2_BUCKET_NAME='' R2_ENDPOINT='' R2_PUBLIC_URL=''
exec npm run start:dev
