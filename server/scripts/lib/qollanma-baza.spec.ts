import { docsBazasiniTekshir } from './qollanma-baza';

describe('docsBazasiniTekshir', () => {
  it.each([
    'postgresql://daf_user:daf_password@localhost:5433/daf_docs',
    'postgresql://daf_user:daf_password@127.0.0.1:5433/daf_docs?schema=public',
  ])('lokal daf_docs ni qabul qiladi: %s', (url) => {
    expect(() => docsBazasiniTekshir(url)).not.toThrow();
  });

  it.each([
    undefined,
    '',
    'bu url emas',
    'postgresql://daf_user:daf_password@localhost:5433/daf_erp',
    'postgresql://daf_user:daf_password@localhost:5432/daf_docs',
    'postgresql://u:p@ep-example-000000.c-1.us-west-2.aws.neon.tech/neondb',
    // pg `?host=` / `?port=` ni manzildagi host/port'dan afzal ko'radi.
    'postgresql://u:p@localhost:5433/daf_docs?host=prod.example.com',
    'postgresql://u:p@localhost:5433/daf_docs?port=5432',
    // Boshqa hamma narsa to'g'ri — faqat host noto'g'ri.
    'postgresql://u:p@db.example.com:5433/daf_docs',
  ])('rad etadi: %s', (url) => {
    expect(() => docsBazasiniTekshir(url)).toThrow();
  });
});
