-- QR-kod orqali bankka tushgan to'lov: admin chek bo'yicha kiritadi (spec 2026-10-25).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'QR';
